import { Command } from "commander";
import { existsSync } from "node:fs";
import path from "node:path";
import { getCoreHealth, runScenarioInit, type SupportedInitProvider } from "@tokenvalve/core";
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
