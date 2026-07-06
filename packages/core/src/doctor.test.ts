import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatDoctorResult, runDoctor } from "./doctor.js";

function tempConfigDir(name: string): string {
  return mkdtempSync(path.join(tmpdir(), name));
}

function writeYaml(configDir: string, file: string, contents: string): void {
  mkdirSync(configDir, { recursive: true });
  writeFileSync(path.join(configDir, file), contents, "utf8");
}

describe("runDoctor", () => {
  it("reports missing config and missing binaries without crashing", () => {
    const configDir = path.join(tmpdir(), "tokenvalve-missing-config-doctor");
    const result = runDoctor({
      workspace: "/workspaces/token-valve",
      configDir,
      pathValue: "",
      requiredBinaries: ["gh"]
    });

    expect(result.status).toBe("warning");
    expect(result.findings.map((entry) => entry.id)).toContain("config.missing");
    expect(result.findings.map((entry) => entry.id)).toContain("binary.missing.gh");
    expect(result.findings.every((entry) => entry.nextStep.length > 0)).toBe(true);
  });

  it("reports invalid YAML and redacts plaintext secret-like values", () => {
    const configDir = tempConfigDir("tokenvalve-doctor-invalid-");
    writeYaml(configDir, "profiles.yaml", "profiles:\n  - id: bad\n    token: ghp_plaintext_secret_value_1234567890\n  -");

    const result = runDoctor({
      workspace: "/workspaces/token-valve",
      configDir,
      pathValue: "",
      requiredBinaries: []
    });
    const output = formatDoctorResult(result);

    expect(result.status).toBe("error");
    expect(result.findings.some((entry) => entry.id === "profile.invalid.1")).toBe(true);
    expect(result.findings.some((entry) => entry.id === "config.plaintext_secret.profiles.yaml")).toBe(true);
    expect(output).not.toContain("ghp_plaintext_secret_value");
    expect(output).toContain("[REDACTED]");
  });

  it("reports profile states and missing binding targets", () => {
    const configDir = tempConfigDir("tokenvalve-doctor-profile-");
    writeYaml(configDir, "profiles.yaml", [
      "profiles:",
      "  - id: github:work",
      "    provider: github",
      "    status: unverified",
      "  - id: openai:old",
      "    provider: openai",
      "    status: expired",
      "  - id: vercel:off",
      "    provider: vercel",
      "    status: disabled"
    ].join("\n"));
    writeYaml(configDir, "bindings.yaml", [
      "workspaces:",
      "  - path: /workspaces/token-valve",
      "    providers:",
      "      github:",
      "        profile: github:missing",
      "        environment: development"
    ].join("\n"));

    const result = runDoctor({
      workspace: "/workspaces/token-valve",
      configDir,
      pathValue: "",
      requiredBinaries: []
    });

    expect(result.findings.map((entry) => entry.id)).toEqual(expect.arrayContaining([
      "profile.unverified.github:work",
      "profile.expired.openai:old",
      "profile.disabled.vercel:off",
      "binding.missing_profile.github"
    ]));
    expect(result.status).toBe("error");
  });

  it("reports custom provider capabilities without risk rules", () => {
    const configDir = tempConfigDir("tokenvalve-doctor-custom-");
    writeYaml(configDir, "custom-providers.yaml", [
      "providers:",
      "  - provider: internal-api",
      "    capabilities:",
      "      - id: internal-status",
      "        type: http-request",
      "        allowedHosts:",
      "          - internal.example.test",
      "        riskRules: []"
    ].join("\n"));

    const result = runDoctor({
      workspace: "/workspaces/token-valve",
      configDir,
      pathValue: "",
      requiredBinaries: []
    });

    expect(result.status).toBe("error");
    expect(result.findings.map((entry) => entry.id)).toContain("custom_provider.missing_risk.internal-api.internal-status");
  });

  it("reports shim PATH issues and active global switch locks", () => {
    const configDir = tempConfigDir("tokenvalve-doctor-runtime-");
    const lockDir = path.join(configDir, "runtime", "global-switch-locks");
    mkdirSync(lockDir, { recursive: true });
    writeYaml(configDir, "profiles.yaml", "profiles: []");
    writeYaml(configDir, "bindings.yaml", "workspaces: []");
    writeFileSync(path.join(lockDir, "github.yaml"), [
      "provider: github",
      "holder: test",
      "expiresAt: 2999-01-01T00:00:00.000Z"
    ].join("\n"), "utf8");

    const result = runDoctor({
      workspace: "/workspaces/token-valve",
      configDir,
      pathValue: "/usr/bin",
      requiredBinaries: [],
      now: () => new Date("2026-07-06T00:00:00.000Z")
    });

    expect(result.findings.map((entry) => entry.id)).toEqual(expect.arrayContaining([
      "shim.path.missing",
      "global_switch.lock.active.github"
    ]));
    expect(result.status).toBe("error");
  });

  it("returns ok when no issues are detected", () => {
    const configDir = tempConfigDir("tokenvalve-doctor-ok-");
    const binDir = path.join(configDir, "bin");
    mkdirSync(binDir, { recursive: true });
    writeYaml(configDir, "profiles.yaml", "profiles: []");
    writeYaml(configDir, "bindings.yaml", "workspaces: []");

    const result = runDoctor({
      workspace: "/workspaces/token-valve",
      configDir,
      pathValue: binDir,
      requiredBinaries: []
    });

    expect(result.status).toBe("ok");
    expect(result.findings).toEqual([{
      id: "doctor.ok",
      severity: "ok",
      message: "No blocking TokenValve issues detected.",
      nextStep: "Continue using TokenValve normally."
    }]);
  });
});
