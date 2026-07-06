import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import type { CustomProviderFiles } from "./custom-provider.js";
import type { RecipeFiles } from "./recipe-store.js";
import type { ProfileInventoryFiles } from "./profile-inventory.js";

export type DoctorSeverity = "ok" | "warning" | "error";

export interface DoctorFinding {
  id: string;
  severity: DoctorSeverity;
  message: string;
  nextStep: string;
}

export interface DoctorInput {
  workspace: string;
  configDir: string;
  pathValue?: string;
  requiredBinaries?: string[];
  now?: () => Date;
}

export interface DoctorResult {
  status: DoctorSeverity;
  findings: DoctorFinding[];
}

const CONFIG_FILES = ["profiles.yaml", "bindings.yaml", "recipes.yaml", "custom-providers.yaml"] as const;
const DEFAULT_BINARIES = ["gh", "supabase", "vercel"];

export function runDoctor(input: DoctorInput): DoctorResult {
  const pathValue = input.pathValue ?? process.env.PATH ?? "";
  const now = input.now ?? (() => new Date());
  const findings: DoctorFinding[] = [];

  if (!existsSync(input.configDir)) {
    findings.push(finding("config.missing", "warning", `TokenValve config directory does not exist: ${input.configDir}.`, "Run tokenvalve init for this workspace."));
    findings.push(...binaryFindings(input.requiredBinaries ?? DEFAULT_BINARIES, pathValue));
    findings.push(...shimFindings(input.configDir, pathValue));
    return result(findings);
  }

  const parsed = readConfigFiles(input.configDir, findings);
  findings.push(...plainSecretFindings(input.configDir));
  findings.push(...profileFindings(parsed.profiles));
  findings.push(...bindingFindings(parsed.profiles, parsed.bindings));
  findings.push(...customProviderFindings(parsed.customProviders));
  findings.push(...binaryFindings(input.requiredBinaries ?? DEFAULT_BINARIES, pathValue));
  findings.push(...shimFindings(input.configDir, pathValue));
  findings.push(...globalSwitchLockFindings(input.configDir, now()));

  if (!findings.some((entry) => entry.severity !== "ok")) {
    findings.push(finding("doctor.ok", "ok", "No blocking TokenValve issues detected.", "Continue using TokenValve normally."));
  }

  return result(findings);
}

export function formatDoctorResult(resultValue: DoctorResult): string {
  const lines = ["TokenValve doctor", `status: ${resultValue.status}`];
  for (const entry of resultValue.findings) {
    lines.push("", `[${entry.severity}] ${entry.id}`, `- message: ${redact(entry.message)}`, `- next: ${redact(entry.nextStep)}`);
  }
  return `${lines.join("\n")}\n`;
}

function readConfigFiles(configDir: string, findings: DoctorFinding[]) {
  const profiles = readYaml<{ profiles: ProfileInventoryFiles["profiles"]["profiles"] }>(configDir, "profiles.yaml", { profiles: [] }, findings);
  const bindings = readYaml<ProfileInventoryFiles["bindings"]>(configDir, "bindings.yaml", { workspaces: [] }, findings);
  const recipes = readYaml<RecipeFiles>(configDir, "recipes.yaml", { recipes: [] }, findings);
  const customProviders = readYaml<CustomProviderFiles>(configDir, "custom-providers.yaml", { providers: [] }, findings);
  return { profiles, bindings, recipes, customProviders };
}

function readYaml<T>(configDir: string, fileName: typeof CONFIG_FILES[number], fallback: T, findings: DoctorFinding[]): T {
  const filePath = path.join(configDir, fileName);
  if (!existsSync(filePath)) {
    return fallback;
  }
  try {
    return parse(readFileSync(filePath, "utf8")) as T;
  } catch (error) {
    findings.push(finding(`config.invalid.${fileName}`, "error", `${fileName} cannot be parsed: ${error instanceof Error ? error.message : String(error)}.`, `Fix or regenerate ${fileName}; do not store plaintext secrets in YAML.`));
    return fallback;
  }
}

function profileFindings(profilesFile: { profiles: ProfileInventoryFiles["profiles"]["profiles"] }): DoctorFinding[] {
  return profilesFile.profiles.flatMap((profile, index) => {
    if (!profile || typeof profile !== "object" || !("id" in profile) || typeof profile.id !== "string") {
      return [finding(`profile.invalid.${index}`, "error", `Profile entry is invalid at index ${index}.`, "Fix profiles.yaml so every profile has an id, provider, and safe metadata.")];
    }
    if (profile.status === "disabled") {
      return [finding(`profile.disabled.${profile.id}`, "error", `Profile is disabled: ${profile.id}.`, "Re-enable, replace, or remove the profile before using it.")];
    }
    if (profile.status === "expired") {
      return [finding(`profile.expired.${profile.id}`, "warning", `Profile is expired: ${profile.id}.`, `Run tokenvalve secret update ${profile.id} or tokenvalve secret test ${profile.id}.`)];
    }
    if (!profile.status || profile.status === "draft" || profile.status === "unverified") {
      return [finding(`profile.unverified.${profile.id}`, "warning", `Profile is not verified: ${profile.id}.`, `Run tokenvalve secret test ${profile.id}.`)];
    }
    return [];
  });
}

function bindingFindings(
  profilesFile: { profiles: ProfileInventoryFiles["profiles"]["profiles"] },
  bindingsFile: ProfileInventoryFiles["bindings"]
): DoctorFinding[] {
  const profileIds = new Set(profilesFile.profiles
    .filter((profile) => profile && typeof profile === "object" && typeof profile.id === "string")
    .map((profile) => profile.id));
  const findings: DoctorFinding[] = [];
  for (const workspace of bindingsFile.workspaces) {
    for (const [provider, binding] of Object.entries(workspace.providers)) {
      if (!profileIds.has(binding.profile)) {
        findings.push(finding(`binding.missing_profile.${provider}`, "error", `Workspace binding references a missing profile: ${binding.profile}.`, `Run tokenvalve secret add for ${binding.profile}, or switch ${provider} to an existing profile.`));
      }
    }
  }
  return findings;
}

function customProviderFindings(customProvidersFile: CustomProviderFiles): DoctorFinding[] {
  return customProvidersFile.providers.flatMap((provider) => provider.capabilities.flatMap((capability) => {
    if (!capability.riskRules || capability.riskRules.length === 0) {
      return [finding(`custom_provider.missing_risk.${provider.provider}.${capability.id}`, "error", `Custom provider capability has no risk rules: ${provider.provider}/${capability.id}.`, "Add an explicit read/write/dangerous risk rule before executing this capability.")];
    }
    return [];
  }));
}

function binaryFindings(requiredBinaries: string[], pathValue: string): DoctorFinding[] {
  return requiredBinaries
    .filter((binary) => !findOnPath(binary, pathValue))
    .map((binary) => finding(`binary.missing.${binary}`, "warning", `Required provider binary is not on PATH: ${binary}.`, `Install ${binary} or remove/disable providers that depend on it.`));
}

function shimFindings(configDir: string, pathValue: string): DoctorFinding[] {
  const binDir = path.join(configDir, "bin");
  const pathEntries = pathValue.split(path.delimiter).filter(Boolean).map((entry) => path.resolve(entry));
  if (!pathEntries.includes(path.resolve(binDir))) {
    return [finding("shim.path.missing", "warning", `TokenValve shim bin directory is not on PATH: ${binDir}.`, `Add ${binDir} before provider CLI directories in PATH when using shims.`)];
  }
  return [];
}

function globalSwitchLockFindings(configDir: string, now: Date): DoctorFinding[] {
  const lockDir = path.join(configDir, "runtime", "global-switch-locks");
  if (!existsSync(lockDir)) {
    return [];
  }
  return readdirSync(lockDir)
    .filter((file) => file.endsWith(".yaml"))
    .map((file) => {
      const fullPath = path.join(lockDir, file);
      try {
        const lock = parse(readFileSync(fullPath, "utf8")) as { provider?: string; holder?: string; expiresAt?: string };
        const expiresAt = lock.expiresAt ? new Date(lock.expiresAt) : undefined;
        if (!expiresAt || Number.isNaN(expiresAt.getTime())) {
          return finding(`global_switch.lock.invalid.${file}`, "error", `Global switch lock is invalid: ${file}.`, "Inspect the lock file and remove it only after confirming no global switch is running.");
        }
        if (expiresAt.getTime() > now.getTime()) {
          return finding(`global_switch.lock.active.${lock.provider ?? file}`, "error", `Global switch lock is active for provider: ${lock.provider ?? file}.`, "Wait for the TTL to expire, or inspect the running process before retrying.");
        }
        return finding(`global_switch.lock.expired.${lock.provider ?? file}`, "warning", `Global switch lock is expired for provider: ${lock.provider ?? file}.`, "Remove the stale lock after confirming no global switch is running.");
      } catch {
        return finding(`global_switch.lock.unreadable.${file}`, "error", `Global switch lock cannot be parsed: ${file}.`, "Inspect the lock file and remove it only after confirming no global switch is running.");
      }
    });
}

function plainSecretFindings(configDir: string): DoctorFinding[] {
  const findings: DoctorFinding[] = [];
  for (const file of CONFIG_FILES) {
    const filePath = path.join(configDir, file);
    if (existsSync(filePath) && containsSecretLike(readFileSync(filePath, "utf8"))) {
      findings.push(finding(`config.plaintext_secret.${file}`, "error", `${file} appears to contain a plaintext secret: [REDACTED].`, `Remove the plaintext value from ${file} and store it through tokenvalve secret add/update.`));
    }
  }
  return findings;
}

function containsSecretLike(value: string): boolean {
  return /(ghp_|gho_|github_pat_|sk-[a-z0-9_-]{16,}|Bearer\s+[a-z0-9._-]{16,}|BEGIN [A-Z ]*PRIVATE KEY|eyJ[a-z0-9_-]{20,})/i.test(value);
}

function redact(value: string): string {
  return value
    .replace(/gh[pousr]_[a-z0-9_]+/gi, "[REDACTED]")
    .replace(/github_pat_[a-z0-9_]+/gi, "[REDACTED]")
    .replace(/sk-[a-z0-9_-]+/gi, "[REDACTED]")
    .replace(/Bearer\s+[a-z0-9._-]+/gi, "Bearer [REDACTED]")
    .replace(/-----BEGIN [\s\S]+?-----END [^-]+-----/g, "[REDACTED_PRIVATE_KEY]");
}

function findOnPath(binary: string, pathValue: string): boolean {
  return pathValue.split(path.delimiter).filter(Boolean).some((entry) => existsSync(path.join(entry, binary)));
}

function finding(id: string, severity: DoctorSeverity, message: string, nextStep: string): DoctorFinding {
  return { id, severity, message: redact(message), nextStep: redact(nextStep) };
}

function result(findings: DoctorFinding[]): DoctorResult {
  const status: DoctorSeverity = findings.some((entry) => entry.severity === "error")
    ? "error"
    : findings.some((entry) => entry.severity === "warning")
      ? "warning"
      : "ok";
  return { status, findings };
}
