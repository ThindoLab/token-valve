import { Command } from "commander";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  getCoreHealth,
  MacOSKeychainSecretStore,
  ProfileInventory,
  runScenarioInit,
  type ProfileStatus,
  type SecretStore,
  type SupportedInitProvider
} from "@tokenvalve/core";
import packageJson from "../package.json" with { type: "json" };

export interface CliOptions {
  writeOut?: (value: string) => void;
  secretStore?: SecretStore;
}

export function createCli(options: CliOptions = {}): Command {
  const writeOut = options.writeOut ?? ((value: string) => process.stdout.write(value));
  const program = new Command();

  program
    .name("tokenvalve")
    .description("Local secret manager, credential broker, and execution gateway for AI agents.")
    .version(packageJson.version);

  program
    .command("doctor")
    .description("Run project skeleton diagnostics.")
    .action(() => {
      const health = getCoreHealth();

      writeOut(
        [
          "TokenValve doctor",
          `- ${health.message}`,
          "- real resolver, secret store, MCP tools, shims, and dashboard diagnostics are implemented in later phases"
        ].join("\n") + "\n"
      );
    });

  program
    .command("init")
    .description("Create TokenValve workspace configuration.")
    .option("--workspace <path>", "Workspace path.", process.cwd())
    .option("--config-dir <path>", "TokenValve config directory.")
    .option("--provider <name>", "Provider to configure.", collectValues, [])
    .option("--add-provider <name>", "Provider to add to existing config.", collectValues, [])
    .option("--llm-key <profile>", "LLM key profile metadata to add.", collectValues, [])
    .option("--yes", "Use non-interactive defaults.")
    .option("--dry-run", "Print the generated plan without writing files.")
    .action((rawOptions: InitCommandOptions) => {
      const workspace = path.resolve(rawOptions.workspace);
      const configDir = path.resolve(rawOptions.configDir ?? path.join(workspace, ".tokenvalve"));

      const result = runScenarioInit({
        workspace,
        configDir,
        providers: normalizeProviders(rawOptions.provider),
        addProviders: normalizeProviders(rawOptions.addProvider),
        llmKeys: rawOptions.llmKey,
        yes: Boolean(rawOptions.yes),
        dryRun: Boolean(rawOptions.dryRun),
        cliAvailability: {
          gh: commandAvailable("gh"),
          supabase: commandAvailable("supabase"),
          vercel: commandAvailable("vercel")
        }
      });

      writeOut(formatInitResult(result, Boolean(rawOptions.dryRun)));
    });

  const secret = program
    .command("secret")
    .description("Manage local secret profile metadata and secret store entries.");

  secret
    .command("add")
    .description("Add a secret profile.")
    .requiredOption("--profile <id>", "Profile id.")
    .requiredOption("--provider <name>", "Provider name.")
    .option("--environment <name>", "Environment name.")
    .option("--display-name <name>", "Display name.")
    .option("--use-case <name>", "Use case label.", collectValues, [])
    .option("--workspace <path>", "Workspace path to bind.")
    .option("--config-dir <path>", "TokenValve config directory.")
    .requiredOption("--secret-value <value>", "Secret value. Prefer local UI or prompt in later phases.")
    .option("--field <name>", "Secret field name.", "token")
    .option("--replace", "Replace an existing profile.")
    .option("--yes", "Confirm non-interactive write.")
    .action(async (rawOptions: SecretAddCommandOptions) => {
      const inventory = createInventory(rawOptions.configDir, rawOptions.workspace, options.secretStore);
      const result = await inventory.addProfile({
        profileId: rawOptions.profile,
        provider: rawOptions.provider,
        environment: rawOptions.environment,
        displayName: rawOptions.displayName,
        useCases: rawOptions.useCase,
        workspace: rawOptions.workspace ? path.resolve(rawOptions.workspace) : undefined,
        secretValue: rawOptions.secretValue,
        field: rawOptions.field,
        replace: Boolean(rawOptions.replace),
        yes: Boolean(rawOptions.yes)
      });
      writeOut(formatSecretChanged("added", result.profile));
    });

  secret
    .command("list")
    .description("List secret profiles without revealing secret values.")
    .option("--config-dir <path>", "TokenValve config directory.")
    .action((rawOptions: SecretListCommandOptions) => {
      const inventory = createInventory(rawOptions.configDir, undefined, options.secretStore);
      writeOut(formatSecretList(inventory.listProfiles()));
    });

  secret
    .command("update")
    .description("Update a secret profile.")
    .argument("<profile>", "Profile id.")
    .option("--config-dir <path>", "TokenValve config directory.")
    .option("--provider <name>", "Provider name.")
    .option("--environment <name>", "Environment name.")
    .option("--display-name <name>", "Display name.")
    .option("--use-case <name>", "Use case label.", collectValues, [])
    .option("--status <status>", "Profile status.")
    .option("--secret-value <value>", "Replacement secret value.")
    .option("--field <name>", "Secret field name.", "token")
    .option("--yes", "Confirm non-interactive write.")
    .action(async (profile: string, rawOptions: SecretUpdateCommandOptions) => {
      const inventory = createInventory(rawOptions.configDir, undefined, options.secretStore);
      const result = await inventory.updateProfile({
        profileId: profile,
        provider: rawOptions.provider,
        environment: rawOptions.environment,
        displayName: rawOptions.displayName,
        useCases: rawOptions.useCase.length > 0 ? rawOptions.useCase : undefined,
        status: rawOptions.status ? normalizeStatus(rawOptions.status) : undefined,
        secretValue: rawOptions.secretValue,
        field: rawOptions.field,
        yes: Boolean(rawOptions.yes)
      });
      writeOut(formatSecretChanged("updated", result.profile));
    });

  secret
    .command("delete")
    .description("Delete a secret profile.")
    .argument("<profile>", "Profile id.")
    .option("--config-dir <path>", "TokenValve config directory.")
    .option("--field <name>", "Secret field name.", "token")
    .option("--yes", "Confirm non-interactive delete.")
    .action(async (profile: string, rawOptions: SecretDeleteCommandOptions) => {
      const inventory = createInventory(rawOptions.configDir, undefined, options.secretStore);
      const deleted = await inventory.deleteProfile({
        profileId: profile,
        field: rawOptions.field,
        yes: Boolean(rawOptions.yes)
      });
      writeOut(formatSecretChanged("deleted", deleted));
    });

  secret
    .command("test")
    .description("Test a secret profile and mark it verified when local checks pass.")
    .argument("<profile>", "Profile id.")
    .option("--config-dir <path>", "TokenValve config directory.")
    .option("--field <name>", "Secret field name.", "token")
    .action(async (profile: string, rawOptions: SecretTestCommandOptions) => {
      const inventory = createInventory(rawOptions.configDir, undefined, options.secretStore);
      const result = await inventory.testProfile({
        profileId: profile,
        field: rawOptions.field
      });
      writeOut(formatSecretChanged("verified", result.profile));
    });

  return program;
}

interface InitCommandOptions {
  workspace: string;
  configDir?: string;
  provider: string[];
  addProvider: string[];
  llmKey: string[];
  yes?: boolean;
  dryRun?: boolean;
}

interface SecretAddCommandOptions {
  profile: string;
  provider: string;
  environment?: string;
  displayName?: string;
  useCase: string[];
  workspace?: string;
  configDir?: string;
  secretValue: string;
  field: string;
  replace?: boolean;
  yes?: boolean;
}

interface SecretListCommandOptions {
  configDir?: string;
}

interface SecretUpdateCommandOptions {
  configDir?: string;
  provider?: string;
  environment?: string;
  displayName?: string;
  useCase: string[];
  status?: string;
  secretValue?: string;
  field: string;
  yes?: boolean;
}

interface SecretDeleteCommandOptions {
  configDir?: string;
  field: string;
  yes?: boolean;
}

interface SecretTestCommandOptions {
  configDir?: string;
  field: string;
}

function collectValues(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function normalizeProviders(values: string[]): SupportedInitProvider[] {
  return values.map((value) => {
    if (value === "github" || value === "supabase" || value === "vercel") {
      return value;
    }
    throw new Error(`Unsupported provider for Phase 6 init: ${value}`);
  });
}

function commandAvailable(command: string): boolean {
  const pathEntries = process.env.PATH?.split(path.delimiter) ?? [];
  return pathEntries.some((entry) => existsSync(path.join(entry, command)));
}

function createInventory(configDir: string | undefined, workspace: string | undefined, secretStore: SecretStore | undefined): ProfileInventory {
  const resolvedConfigDir = path.resolve(configDir ?? path.join(workspace ? path.resolve(workspace) : process.cwd(), ".tokenvalve"));
  return new ProfileInventory({
    configDir: resolvedConfigDir,
    store: secretStore ?? new MacOSKeychainSecretStore()
  });
}

function normalizeStatus(value: string): ProfileStatus {
  if (value === "draft" || value === "unverified" || value === "verified" || value === "expired" || value === "disabled") {
    return value;
  }
  throw new Error(`Unsupported profile status: ${value}`);
}

function formatInitResult(result: ReturnType<typeof runScenarioInit>, dryRun: boolean): string {
  const lines = [
    "TokenValve init",
    `- workspace: ${result.detections.workspace}`,
    `- git remote: ${result.detections.gitRemote ?? "not detected"}`,
    `- supabase config: ${result.detections.hasSupabaseConfig ? "detected" : "not detected"}`,
    `- vercel config: ${result.detections.hasVercelConfig ? "detected" : "not detected"}`,
    "- selected providers are explicit; unselected providers are not auto-managed",
    dryRun ? "- dry-run: no files written" : `- files written: ${result.writtenFiles.length}`,
    "",
    "Dry-run matrix:"
  ];

  for (const row of result.dryRunMatrix) {
    lines.push(
      `- ${row.label}: ${row.decision} (${row.reason}) provider=${row.provider} profile=${row.profile ?? "none"} risk=${row.risk ?? "none"}`
    );
  }

  return `${lines.join("\n")}\n`;
}

function formatSecretChanged(action: string, profile: { id: string; provider: string; environment?: string; status?: string }): string {
  return [
    "TokenValve secret",
    `- ${action}: ${profile.id}`,
    `- provider: ${profile.provider}`,
    `- environment: ${profile.environment ?? "not set"}`,
    `- status: ${profile.status ?? "unverified"}`,
    "- secret value: stored outside YAML and hidden from output"
  ].join("\n") + "\n";
}

function formatSecretList(profiles: Array<{
  id: string;
  provider: string;
  environment?: string;
  status?: string;
  useCases?: string[];
  boundWorkspaces?: string[];
  maskedFingerprint?: string;
}>): string {
  const lines = ["TokenValve secret profiles"];
  if (profiles.length === 0) {
    lines.push("- none");
    return `${lines.join("\n")}\n`;
  }

  for (const profile of profiles) {
    lines.push(
      [
        `- ${profile.id}`,
        `provider=${profile.provider}`,
        `environment=${profile.environment ?? "not-set"}`,
        `status=${profile.status ?? "unverified"}`,
        `useCases=${profile.useCases?.join(",") || "none"}`,
        `bindings=${profile.boundWorkspaces?.length ?? 0}`,
        `fingerprint=${profile.maskedFingerprint ?? "none"}`
      ].join(" ")
    );
  }
  return `${lines.join("\n")}\n`;
}
