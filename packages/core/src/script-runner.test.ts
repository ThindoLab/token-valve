import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CustomProviderStore, customProvidersToAdapters } from "./custom-provider.js";
import { MemorySecretStore } from "./secret-store.js";
import { runScriptCommand } from "./script-runner.js";
import type { ProcessRunInput, ProcessRunner } from "./github-runner.js";
import type { TokenValveConfig } from "./types.js";

const WORKSPACE = "/workspaces/token-valve";
const TOKEN = "custom_script_secret_1234567890";

class FakeProcessRunner implements ProcessRunner {
  public readonly calls: ProcessRunInput[] = [];

  public async run(input: ProcessRunInput) {
    this.calls.push(input);
    return {
      stdout: `script ok ${input.env.INTERNAL_TOKEN ?? ""}`,
      stderr: "",
      exitCode: 0
    };
  }
}

function makeConfig(): TokenValveConfig {
  return {
    workspaces: [{
      path: WORKSPACE,
      providers: {
        "internal-tool": { profile: "internal-tool:default", environment: "development" }
      }
    }],
    profiles: [
      { id: "internal-tool:default", provider: "internal-tool", environment: "development", status: "verified" }
    ]
  };
}

describe("runScriptCommand", () => {
  it("injects custom env templates only into the child process and redacts output", async () => {
    const store = new CustomProviderStore({ configDir: mkdtempSync(path.join(tmpdir(), "tokenvalve-script-")) });
    store.saveScriptMapping({
      provider: "internal-tool",
      capability: "internal-script",
      scripts: ["/usr/local/bin/internal-tool"],
      env: { INTERNAL_TOKEN: "{{token}}" },
      riskRules: [{ capability: "internal-script", match: ["/usr/local/bin/internal-tool"], risk: "read" }]
    });
    const secretStore = new MemorySecretStore();
    await secretStore.writeSecret({
      profileId: "internal-tool:default",
      field: "token",
      value: TOKEN
    });
    const runner = new FakeProcessRunner();
    const before = process.env.INTERNAL_TOKEN;

    const result = await runScriptCommand({
      workspace: WORKSPACE,
      config: makeConfig(),
      adapters: customProvidersToAdapters(store.list()),
      secretStore,
      provider: "internal-tool",
      script: "/usr/local/bin/internal-tool",
      envTemplates: { INTERNAL_TOKEN: "{{token}}" },
      runner
    });

    expect(result.executed).toBe(true);
    expect(runner.calls[0]?.env).toEqual({ INTERNAL_TOKEN: TOKEN });
    expect(process.env.INTERNAL_TOKEN).toBe(before);
    expect(result.stdout).not.toContain(TOKEN);
    expect(JSON.stringify(result.audit)).not.toContain(TOKEN);
  });

  it("fails closed when a custom script has no risk rules", async () => {
    const store = new CustomProviderStore({ configDir: mkdtempSync(path.join(tmpdir(), "tokenvalve-script-risk-")) });
    store.saveScriptMapping({
      provider: "internal-tool",
      capability: "internal-script",
      scripts: ["/usr/local/bin/internal-tool"],
      env: { INTERNAL_TOKEN: "{{token}}" }
    });
    const secretStore = new MemorySecretStore();
    const runner = new FakeProcessRunner();

    const result = await runScriptCommand({
      workspace: WORKSPACE,
      config: makeConfig(),
      adapters: customProvidersToAdapters(store.list()),
      secretStore,
      provider: "internal-tool",
      script: "/usr/local/bin/internal-tool",
      envTemplates: { INTERNAL_TOKEN: "{{token}}" },
      runner
    });

    expect(result.executed).toBe(false);
    expect(result.resolve).toMatchObject({
      decision: "blocked",
      reason: "risk_unknown"
    });
    expect(runner.calls).toEqual([]);
  });
});
