import { shapeAuditEvent, type AuditEvent } from "./audit.js";
import { type ProcessRunner, NodeProcessRunner } from "./github-runner.js";
import { redactForReturn } from "./redactor.js";
import { createSecretRef, type SecretStore } from "./secret-store.js";
import { resolveContext } from "./resolver.js";
import type { AdapterDefinition, AgentSessionContext, ResolveResult, TokenValveConfig } from "./types.js";

export interface VercelCliRunInput {
  workspace: string;
  config: TokenValveConfig;
  secretStore: SecretStore;
  args: string[];
  session?: AgentSessionContext;
  runner?: ProcessRunner;
}

export interface VercelRunResult {
  resolve: ResolveResult;
  stdout: string;
  stderr: string;
  exitCode: number;
  audit: AuditEvent;
  executed: boolean;
}

export const VERCEL_ADAPTER: AdapterDefinition = {
  provider: "vercel",
  capabilities: [{ id: "vercel-cli", type: "cli-command", commands: ["vercel"] }],
  riskRules: [
    { capability: "vercel-cli", match: ["deploy"], risk: "write" },
    { capability: "vercel-cli", match: ["deploy", "--prod"], risk: "production_deploy" }
  ]
};

export async function runVercelCli(input: VercelCliRunInput): Promise<VercelRunResult> {
  const resolve = resolveContext({
    workspace: input.workspace,
    config: input.config,
    adapters: [VERCEL_ADAPTER],
    session: input.session,
    execution: {
      kind: "cli",
      command: "vercel",
      args: input.args
    }
  });

  const policyBlock = getVercelPolicyBlock(resolve, input.args);
  if (policyBlock) {
    return blockedResult(input, { ...resolve, decision: "blocked", reason: policyBlock.reason, message: policyBlock.message }, policyBlock.message);
  }

  if (resolve.decision === "blocked" || resolve.risk !== "write") {
    return blockedResult(input, resolve, "Vercel command blocked before execution.");
  }

  const credential = await readVercelCredential(input.secretStore, resolve);
  if (!credential.token) {
    return blockedResult(input, {
      ...resolve,
      decision: "blocked",
      reason: "profile_not_configured",
      message: `Vercel token is missing for profile: ${resolve.profile ?? "unknown"}.`
    }, "Vercel token is missing.");
  }

  const env = {
    VERCEL_TOKEN: credential.token,
    ...(credential.orgId ? { VERCEL_ORG_ID: credential.orgId } : {}),
    ...(credential.projectId ? { VERCEL_PROJECT_ID: credential.projectId } : {})
  };
  const processResult = await (input.runner ?? new NodeProcessRunner()).run({
    command: "vercel",
    args: input.args,
    env
  });
  const knownSecrets = [credential.token, credential.orgId, credential.projectId].filter((value): value is string => Boolean(value));
  const stdout = redactForReturn(processResult.stdout, { knownSecrets }).text;
  const stderr = redactForReturn(processResult.stderr, { knownSecrets }).text;

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
      command: { binary: "vercel", args: input.args },
      message: `${stdout}\n${stderr}`,
      knownSecrets
    })
  };
}

function getVercelPolicyBlock(resolve: ResolveResult, args: string[]): Pick<ResolveResult, "reason" | "message"> | undefined {
  if (isGlobalAuthCommand(args)) {
    return {
      reason: "capability_not_configured",
      message: "Vercel global auth commands are not allowed by TokenValve."
    };
  }

  if (resolve.risk === "production_deploy") {
    return {
      reason: "human_intent_required",
      message: "Human intent is required for Vercel production deploys."
    };
  }

  return undefined;
}

async function readVercelCredential(secretStore: SecretStore, resolve: ResolveResult): Promise<{
  token: string | null;
  orgId: string | null;
  projectId: string | null;
}> {
  if (!resolve.profile) {
    return { token: null, orgId: null, projectId: null };
  }

  const storeName = getStoreName(secretStore);
  const token = await secretStore.readSecret(createSecretRef(storeName, resolve.profile, "token"));
  const orgId = await secretStore.readSecret(createSecretRef(storeName, resolve.profile, "org_id"));
  const projectId = await secretStore.readSecret(createSecretRef(storeName, resolve.profile, "project_id"));
  return { token, orgId, projectId };
}

function blockedResult(input: VercelCliRunInput, resolve: ResolveResult, message: string): VercelRunResult {
  return {
    resolve,
    stdout: "",
    stderr: message,
    exitCode: 1,
    executed: false,
    audit: shapeAuditEvent({
      source: "cli",
      provider: resolve.provider ?? "vercel",
      profile: resolve.profile,
      environment: resolve.environment,
      capability: resolve.capability,
      risk: resolve.risk,
      decision: "blocked",
      reason: resolve.reason,
      session: input.session ? { id: input.session.id, client: input.session.client } : undefined,
      command: { binary: "vercel", args: input.args },
      message
    })
  };
}

function isGlobalAuthCommand(args: string[]): boolean {
  return ["login", "logout", "switch"].includes(args[0] ?? "");
}

function getStoreName(store: SecretStore): string {
  return "store" in store && typeof store.store === "string" ? store.store : "secret-store";
}
