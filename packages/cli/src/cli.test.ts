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
});
