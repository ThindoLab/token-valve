import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runWithGlobalSwitch, type GlobalSwitchHandler } from "./global-switch.js";
import type { AdapterDefinition, TokenValveConfig } from "./types.js";

const WORKSPACE = "/workspaces/token-valve";

function config(): TokenValveConfig {
  return {
    workspaces: [{ path: WORKSPACE, providers: { legacy: { profile: "legacy:work", environment: "development" } } }],
    profiles: [{ id: "legacy:work", provider: "legacy", environment: "development", status: "verified" }]
  };
}

function adapter(optIn = true, risks = true): AdapterDefinition {
  return {
    provider: "legacy",
    executionModes: optIn ? ["global-switch"] : undefined,
    capabilities: [{ id: "legacy-cli", type: "cli-command", commands: ["legacy"] }],
    riskRules: risks ? [{ capability: "legacy-cli", match: ["whoami"], risk: "read" }] : []
  };
}

class FakeHandler implements GlobalSwitchHandler {
  public readonly calls: string[] = [];
  public failRun = false;

  public async snapshot() {
    this.calls.push("snapshot");
    return { summary: "before=legacy-old" };
  }

  public async switchTo(profile: string) {
    this.calls.push(`switch:${profile}`);
  }

  public async run() {
    this.calls.push("run");
    if (this.failRun) {
      throw new Error("legacy command failed");
    }
    return { stdout: "ok", stderr: "", exitCode: 0 };
  }

  public async restore() {
    this.calls.push("restore");
  }
}

describe("runWithGlobalSwitch", () => {
  it("rejects adapters that did not opt in", async () => {
    const handler = new FakeHandler();
    const result = await runWithGlobalSwitch({
      configDir: mkdtempSync(path.join(tmpdir(), "tokenvalve-global-")),
      workspace: WORKSPACE,
      config: config(),
      adapter: adapter(false),
      provider: "legacy",
      command: "legacy",
      args: ["whoami"],
      handler
    });

    expect(result.executed).toBe(false);
    expect(result.stderr).toContain("has not opted in");
    expect(handler.calls).toEqual([]);
  });

  it("fails closed on provider lock conflicts", async () => {
    const configDir = mkdtempSync(path.join(tmpdir(), "tokenvalve-global-lock-"));
    const lockDir = path.join(configDir, "runtime", "global-switch-locks");
    const lockPath = path.join(lockDir, "legacy.yaml");
    await import("node:fs").then(({ mkdirSync }) => mkdirSync(lockDir, { recursive: true }));
    writeFileSync(lockPath, "provider: legacy\nholder: other\nexpiresAt: 2999-01-01T00:00:00.000Z\n", "utf8");
    const handler = new FakeHandler();

    const result = await runWithGlobalSwitch({
      configDir,
      workspace: WORKSPACE,
      config: config(),
      adapter: adapter(),
      provider: "legacy",
      command: "legacy",
      args: ["whoami"],
      handler
    });

    expect(result.executed).toBe(false);
    expect(result.stderr).toContain("lock conflict");
    expect(handler.calls).toEqual([]);
  });

  it("restores state after command failure and removes the lock", async () => {
    const configDir = mkdtempSync(path.join(tmpdir(), "tokenvalve-global-fail-"));
    const handler = new FakeHandler();
    handler.failRun = true;

    const result = await runWithGlobalSwitch({
      configDir,
      workspace: WORKSPACE,
      config: config(),
      adapter: adapter(),
      provider: "legacy",
      command: "legacy",
      args: ["whoami"],
      handler
    });

    expect(result.executed).toBe(false);
    expect(result.restored).toBe(true);
    expect(result.repairSuggestions.join(" ")).toContain("legacy command failed");
    expect(handler.calls).toEqual(["snapshot", "switch:legacy:work", "run", "restore"]);
    expect(existsSync(path.join(configDir, "runtime", "global-switch-locks", "legacy.yaml"))).toBe(false);
  });

  it("executes, restores, and audits successful global switches", async () => {
    const handler = new FakeHandler();
    const result = await runWithGlobalSwitch({
      configDir: mkdtempSync(path.join(tmpdir(), "tokenvalve-global-ok-")),
      workspace: WORKSPACE,
      config: config(),
      adapter: adapter(),
      provider: "legacy",
      command: "legacy",
      args: ["whoami"],
      handler
    });

    expect(result.executed).toBe(true);
    expect(result.restored).toBe(true);
    expect(result.audit).toMatchObject({
      provider: "legacy",
      profile: "legacy:work",
      decision: "allow"
    });
    expect(JSON.stringify(result.audit)).not.toContain("secret");
  });
});
