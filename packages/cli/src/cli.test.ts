import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CommanderError } from "commander";
import { createCli } from "./cli.js";

async function runCli(args: string[]): Promise<string> {
  const output: string[] = [];
  const program = createCli({ writeOut: (value) => output.push(value) });

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
});
