import { Command } from "commander";
import { getCoreHealth } from "@tokenvalve/core";
import packageJson from "../package.json" with { type: "json" };

export interface CliOptions {
  writeOut?: (value: string) => void;
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

  return program;
}
