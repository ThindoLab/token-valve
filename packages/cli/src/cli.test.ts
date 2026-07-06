import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CommanderError } from "commander";
import { MemorySecretStore } from "@tokenvalve/core";
import { createCli } from "./cli.js";

async function runCli(args: string[], options: { secretStore?: MemorySecretStore } = {}): Promise<string> {
  const output: string[] = [];
  const program = createCli({ writeOut: (value) => output.push(value), secretStore: options.secretStore });

  program.exitOverride();
  program.configureOutput({
    writeOut: (value) => output.push(value),
    writeErr: (value) => output.push(value)
  });

  try {
    await program.parseAsync(["node", "tokenvalve", ...args]);
  } catch (error) {
    if (!(error instanceof CommanderError) || error.exitCode !== 0) {
      throw error;
    }
  }

  return output.join("");
}

describe("tokenvalve cli", () => {
  it("prints the package version", async () => {
    await expect(runCli(["--version"])).resolves.toMatch(/0\.1\.0/);
  });

  it("prints the phase 1 doctor placeholder", async () => {
    await expect(runCli(["doctor"])).resolves.toContain("project skeleton is runnable");
  });

  it("runs scenario init and writes workspace config", async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), "tokenvalve-cli-init-"));
    const configDir = path.join(workspace, ".tokenvalve");

    const output = await runCli([
      "init",
      "--workspace",
      workspace,
      "--config-dir",
      configDir,
      "--provider",
      "github",
      "--llm-key",
      "openai:work",
      "--yes"
    ]);

    expect(output).toContain("TokenValve init");
    expect(output).toContain("Dry-run matrix:");
    expect(output).toContain("OpenAI code generation: allow");
    expect(existsSync(path.join(configDir, "config.yaml"))).toBe(true);
    expect(existsSync(path.join(configDir, "profiles.yaml"))).toBe(true);
    expect(existsSync(path.join(configDir, "bindings.yaml"))).toBe(true);
    expect(existsSync(path.join(configDir, "policies.yaml"))).toBe(true);
  });

  it("runs scenario init dry-run without writing config", async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), "tokenvalve-cli-init-dry-"));
    const configDir = path.join(workspace, ".tokenvalve");

    const output = await runCli([
      "init",
      "--workspace",
      workspace,
      "--config-dir",
      configDir,
      "--provider",
      "github",
      "--dry-run",
      "--yes"
    ]);

    expect(output).toContain("dry-run: no files written");
    expect(output).toContain("GitHub repo view: allow");
    expect(existsSync(configDir)).toBe(false);
  });

  it("manages secret profiles without printing secret values", async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), "tokenvalve-cli-secret-"));
    const configDir = path.join(workspace, ".tokenvalve");
    const store = new MemorySecretStore();
    const secret = "ghp_cli_secret_value";

    const addOutput = await runCli([
      "secret",
      "add",
      "--config-dir",
      configDir,
      "--workspace",
      workspace,
      "--profile",
      "github:work",
      "--provider",
      "github",
      "--environment",
      "development",
      "--use-case",
      "cli",
      "--secret-value",
      secret,
      "--yes"
    ], { secretStore: store });

    expect(addOutput).toContain("TokenValve secret");
    expect(addOutput).toContain("added: github:work");
    expect(addOutput).not.toContain(secret);

    const listOutput = await runCli(["secret", "list", "--config-dir", configDir], { secretStore: store });
    expect(listOutput).toContain("github:work");
    expect(listOutput).toContain("unverified");
    expect(listOutput).toContain("fingerprint=sha256:");
    expect(listOutput).not.toContain(secret);
  });

  it("tests, updates, and deletes a secret profile", async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), "tokenvalve-cli-secret-cycle-"));
    const configDir = path.join(workspace, ".tokenvalve");
    const store = new MemorySecretStore();

    await runCli([
      "secret",
      "add",
      "--config-dir",
      configDir,
      "--profile",
      "github:work",
      "--provider",
      "github",
      "--secret-value",
      "ghp_original_secret",
      "--yes"
    ], { secretStore: store });

    const testOutput = await runCli(["secret", "test", "github:work", "--config-dir", configDir], { secretStore: store });
    expect(testOutput).toContain("verified: github:work");
    expect(testOutput).toContain("status: verified");

    const updateOutput = await runCli([
      "secret",
      "update",
      "github:work",
      "--config-dir",
      configDir,
      "--secret-value",
      "ghp_replaced_secret",
      "--yes"
    ], { secretStore: store });
    expect(updateOutput).toContain("status: unverified");
    expect(updateOutput).not.toContain("ghp_replaced_secret");

    const deleteOutput = await runCli([
      "secret",
      "delete",
      "github:work",
      "--config-dir",
      configDir,
      "--yes"
    ], { secretStore: store });
    expect(deleteOutput).toContain("deleted: github:work");

    const listOutput = await runCli(["secret", "list", "--config-dir", configDir], { secretStore: store });
    expect(listOutput).toContain("- none");
  });

  it("manages LLM key profiles and resolves client defaults without printing API keys", async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), "tokenvalve-cli-llm-"));
    const configDir = path.join(workspace, ".tokenvalve");
    const store = new MemorySecretStore();
    const openaiKey = "sk_openai_cli_secret";
    const anthropicKey = "sk_anthropic_cli_secret";

    const openaiOutput = await runCli([
      "llm",
      "add",
      "--config-dir",
      configDir,
      "--workspace",
      workspace,
      "--profile",
      "openai:work",
      "--provider",
      "openai",
      "--api-key",
      openaiKey,
      "--base-url",
      "https://api.openai.com/v1",
      "--model",
      "gpt-4.1",
      "--use-case",
      "code-generation",
      "--client",
      "codex",
      "--yes"
    ], { secretStore: store });
    expect(openaiOutput).toContain("TokenValve llm");
    expect(openaiOutput).toContain("added: openai:work");
    expect(openaiOutput).not.toContain(openaiKey);

    await runCli([
      "llm",
      "add",
      "--config-dir",
      configDir,
      "--workspace",
      workspace,
      "--profile",
      "anthropic:work",
      "--provider",
      "anthropic",
      "--api-key",
      anthropicKey,
      "--model",
      "claude-sonnet",
      "--use-case",
      "review",
      "--yes"
    ], { secretStore: store });

    const listOutput = await runCli(["llm", "list", "--config-dir", configDir], { secretStore: store });
    expect(listOutput).toContain("openai:work");
    expect(listOutput).toContain("anthropic:work");
    expect(listOutput).toContain("model=gpt-4.1");
    expect(listOutput).not.toContain(openaiKey);
    expect(listOutput).not.toContain(anthropicKey);

    await runCli([
      "llm",
      "use",
      "openai:work",
      "--config-dir",
      configDir,
      "--workspace",
      workspace,
      "--provider",
      "openai",
      "--client",
      "codex",
      "--use-case",
      "code-generation",
      "--yes"
    ], { secretStore: store });

    const resolveOutput = await runCli([
      "llm",
      "resolve",
      "--config-dir",
      configDir,
      "--workspace",
      workspace,
      "--provider",
      "openai",
      "--client",
      "codex",
      "--use-case",
      "code-generation"
    ], { secretStore: store });
    expect(resolveOutput).toContain("decision: allow");
    expect(resolveOutput).toContain("profile: openai:work");
    expect(resolveOutput).not.toContain(openaiKey);
  });
});
