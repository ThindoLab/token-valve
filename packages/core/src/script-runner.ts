import { shapeAuditEvent, type AuditEvent } from "./audit.js";
import { NodeProcessRunner, type ProcessRunner } from "./github-runner.js";
import { redactForReturn } from "./redactor.js";
import { resolveContext } from "./resolver.js";
import { createSecretRef, type SecretStore } from "./secret-store.js";
import type { AdapterDefinition, AgentSessionContext, ResolveResult, TokenValveConfig } from "./types.js";

export interface ScriptCommandRunInput {
  workspace: string;
  config: TokenValveConfig;
  adapters: AdapterDefinition[];
  secretStore: SecretStore;
  provider: string;
  script: string;
  args?: string[];
  secretField?: string;
  envTemplates?: Record<string, string>;
  session?: AgentSessionContext;
  runner?: ProcessRunner;
}

export interface ScriptCommandRunResult {
  resolve: ResolveResult;
  stdout: string;
  stderr: string;
  exitCode: number;
  audit: AuditEvent;
  executed: boolean;
  command?: {
    binary: string;
    args: string[];
    env: Record<string, string>;
  };
}

export async function runScriptCommand(input: ScriptCommandRunInput): Promise<ScriptCommandRunResult> {
  const resolve = resolveContext({
    workspace: input.workspace,
    config: input.config,
    adapters: input.adapters,
    session: input.session,
    execution: {
      kind: "script",
      provider: input.provider,
      script: input.script
    }
  });

  if (resolve.decision === "blocked") {
    return blockedScriptResult(input, resolve, "Script command blocked before execution.");
  }

  const token = await readProfileSecret(input.secretStore, resolve, input.secretField ?? "token");
  if (!token && input.envTemplates && Object.keys(input.envTemplates).length > 0) {
    return blockedScriptResult(input, {
      ...resolve,
      decision: "blocked",
      reason: "profile_not_configured",
      message: `Secret is missing for profile: ${resolve.profile ?? "unknown"}.`
    }, "Script secret is missing.");
  }

  const knownSecrets = token ? [token] : [];
  const env = renderEnv(input.envTemplates ?? {}, token ?? undefined);
  const args = input.args ?? [];
  const processResult = await (input.runner ?? new NodeProcessRunner()).run({
    command: input.script,
    args,
    env
  });
  const stdout = redactForReturn(processResult.stdout, { knownSecrets }).text;
  const stderr = redactForReturn(processResult.stderr, { knownSecrets }).text;

  return {
    resolve,
    stdout,
    stderr,
    exitCode: processResult.exitCode,
    executed: true,
    command: {
      binary: input.script,
      args,
      env
    },
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
      command: { binary: input.script, args },
      message: `${stdout}\n${stderr}`,
      knownSecrets
    })
  };
}

function renderEnv(templates: Record<string, string>, token: string | undefined): Record<string, string> {
  return Object.fromEntries(Object.entries(templates).map(([key, value]) => [key, value.replace(/\{\{token\}\}/g, token ?? "")]));
}

async function readProfileSecret(secretStore: SecretStore, resolve: ResolveResult, field: string): Promise<string | null> {
  if (!resolve.profile) {
    return null;
  }
  return secretStore.readSecret(createSecretRef(getStoreName(secretStore), resolve.profile, field));
}

function blockedScriptResult(input: ScriptCommandRunInput, resolve: ResolveResult, message: string): ScriptCommandRunResult {
  return {
    resolve,
    stdout: "",
    stderr: message,
    exitCode: 1,
    executed: false,
    audit: shapeAuditEvent({
      source: "cli",
      provider: resolve.provider,
      profile: resolve.profile,
      environment: resolve.environment,
      capability: resolve.capability,
      risk: resolve.risk,
      decision: "blocked",
      reason: resolve.reason,
      command: { binary: input.script, args: input.args ?? [] },
      message
    })
  };
}

function getStoreName(store: SecretStore): string {
  return "store" in store && typeof store.store === "string" ? store.store : "secret-store";
}
