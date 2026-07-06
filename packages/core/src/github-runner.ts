import { spawn } from "node:child_process";
import { shapeAuditEvent, type AuditEvent } from "./audit.js";
import { redactForReturn } from "./redactor.js";
import { createSecretRef, type SecretStore } from "./secret-store.js";
import { resolveContext } from "./resolver.js";
import type { AdapterDefinition, AgentSessionContext, ResolveResult, TokenValveConfig } from "./types.js";

export interface ProcessRunInput {
  command: string;
  args: string[];
  env: Record<string, string>;
}

export interface ProcessRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ProcessRunner {
  run(input: ProcessRunInput): Promise<ProcessRunResult>;
}

export class NodeProcessRunner implements ProcessRunner {
  public async run(input: ProcessRunInput): Promise<ProcessRunResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(input.command, input.args, {
        env: { ...process.env, ...input.env },
        stdio: ["ignore", "pipe", "pipe"]
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];

      child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
      child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
      child.on("error", reject);
      child.on("close", (exitCode) => {
        resolve({
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8"),
          exitCode: exitCode ?? 1
        });
      });
    });
  }
}

export interface GitHubRunInput {
  workspace: string;
  config: TokenValveConfig;
  secretStore: SecretStore;
  args: string[];
  session?: AgentSessionContext;
  runner?: ProcessRunner;
}

export interface GitHubRunResult {
  resolve: ResolveResult;
  stdout: string;
  stderr: string;
  exitCode: number;
  audit: AuditEvent;
  executed: boolean;
}

export const GITHUB_ADAPTER: AdapterDefinition = {
  provider: "github",
  capabilities: [{ id: "github-cli", type: "cli-command", commands: ["gh"] }],
  riskRules: [
    { capability: "github-cli", match: ["api", "user"], risk: "read" },
    { capability: "github-cli", match: ["repo", "view"], risk: "read" },
    { capability: "github-cli", match: ["repo", "list"], risk: "read" },
    { capability: "github-cli", match: ["repo", "delete"], risk: "dangerous" }
  ]
};

export async function runGitHubCli(input: GitHubRunInput): Promise<GitHubRunResult> {
  const resolve = resolveContext({
    workspace: input.workspace,
    config: input.config,
    adapters: [GITHUB_ADAPTER],
    session: input.session,
    execution: {
      kind: "cli",
      command: "gh",
      args: input.args
    }
  });

  if (resolve.decision === "blocked" || resolve.risk !== "read") {
    return blockedResult(input, resolve, "GitHub command blocked before execution.");
  }

  if (isGlobalAuthCommand(input.args)) {
    return blockedResult(input, {
      ...resolve,
      decision: "blocked",
      reason: "capability_not_configured",
      message: "GitHub global auth commands are not allowed by TokenValve."
    }, "GitHub global auth commands are not allowed.");
  }

  if (!resolve.profile) {
    return blockedResult(input, {
      ...resolve,
      decision: "blocked",
      reason: "profile_not_configured",
      message: "GitHub profile is missing."
    }, "GitHub profile is missing.");
  }

  const secretRef = createSecretRef(getStoreName(input.secretStore), resolve.profile, "token");
  const token = await input.secretStore.readSecret(secretRef);
  if (!token) {
    return blockedResult(input, {
      ...resolve,
      decision: "blocked",
      reason: "profile_not_configured",
      message: `GitHub token is missing for profile: ${resolve.profile}.`
    }, "GitHub token is missing.");
  }

  const processResult = await (input.runner ?? new NodeProcessRunner()).run({
    command: "gh",
    args: input.args,
    env: {
      GH_TOKEN: token,
      GITHUB_TOKEN: token
    }
  });
  const stdout = redactForReturn(processResult.stdout, { knownSecrets: [token] }).text;
  const stderr = redactForReturn(processResult.stderr, { knownSecrets: [token] }).text;

  return {
    resolve,
    stdout,
    stderr,
    exitCode: processResult.exitCode,
    executed: true,
    audit: shapeAuditEvent({
      source: "cli",
      provider: resolve.provider,
      profile: resolve.profile,
      environment: resolve.environment,
      capability: resolve.capability,
      risk: resolve.risk,
      decision: resolve.decision,
      reason: resolve.reason,
      session: input.session ? { id: input.session.id, client: input.session.client } : undefined,
      command: { binary: "gh", args: input.args },
      message: `${stdout}\n${stderr}`,
      knownSecrets: [token]
    })
  };
}

function blockedResult(input: GitHubRunInput, resolve: ResolveResult, message: string): GitHubRunResult {
  return {
    resolve,
    stdout: "",
    stderr: message,
    exitCode: 1,
    executed: false,
    audit: shapeAuditEvent({
      source: "cli",
      provider: resolve.provider ?? "github",
      profile: resolve.profile,
      environment: resolve.environment,
      capability: resolve.capability,
      risk: resolve.risk,
      decision: "blocked",
      reason: resolve.reason,
      session: input.session ? { id: input.session.id, client: input.session.client } : undefined,
      command: { binary: "gh", args: input.args },
      message
    })
  };
}

function isGlobalAuthCommand(args: string[]): boolean {
  return args[0] === "auth" && ["switch", "login", "logout"].includes(args[1] ?? "");
}

function getStoreName(store: SecretStore): string {
  return "store" in store && typeof store.store === "string" ? store.store : "secret-store";
}
