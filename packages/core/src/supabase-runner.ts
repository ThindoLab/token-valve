import { shapeAuditEvent, type AuditEvent } from "./audit.js";
import { type ProcessRunner, NodeProcessRunner } from "./github-runner.js";
import { redactForReturn } from "./redactor.js";
import { createSecretRef, type SecretStore } from "./secret-store.js";
import { resolveContext } from "./resolver.js";
import type { AdapterDefinition, AgentSessionContext, ResolveResult, TokenValveConfig } from "./types.js";

export interface HttpRunInput {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

export interface HttpRunResult {
  status: number;
  body: string;
  headers?: Record<string, string>;
}

export interface HttpRunner {
  run(input: HttpRunInput): Promise<HttpRunResult>;
}

export class FetchHttpRunner implements HttpRunner {
  public async run(input: HttpRunInput): Promise<HttpRunResult> {
    const response = await fetch(input.url, {
      method: input.method,
      headers: input.headers
    });
    return {
      status: response.status,
      body: await response.text(),
      headers: Object.fromEntries(response.headers.entries())
    };
  }
}

export interface SupabaseCliRunInput {
  workspace: string;
  config: TokenValveConfig;
  secretStore: SecretStore;
  args: string[];
  session?: AgentSessionContext;
  runner?: ProcessRunner;
}

export interface SupabaseApiRunInput {
  workspace: string;
  config: TokenValveConfig;
  secretStore: SecretStore;
  method: string;
  url: string;
  session?: AgentSessionContext;
  runner?: HttpRunner;
}

export interface SupabaseRunResult {
  resolve: ResolveResult;
  stdout: string;
  stderr: string;
  exitCode: number;
  audit: AuditEvent;
  executed: boolean;
}

export interface SupabaseApiResult {
  resolve: ResolveResult;
  status: number;
  body: string;
  audit: AuditEvent;
  executed: boolean;
}

export const SUPABASE_ADAPTER: AdapterDefinition = {
  provider: "supabase",
  capabilities: [
    { id: "supabase-cli", type: "cli-command", commands: ["supabase"] },
    {
      id: "management-api",
      type: "http-request",
      allowedHosts: ["api.supabase.com"],
      pathPrefixes: ["/v1"],
      methods: ["GET"]
    }
  ],
  riskRules: [
    { capability: "supabase-cli", match: ["projects", "list"], risk: "read" },
    { capability: "supabase-cli", match: ["db", "push"], risk: "write" },
    { capability: "supabase-cli", match: ["db", "reset"], risk: "dangerous" },
    { capability: "supabase-cli", match: ["secrets", "set"], risk: "dangerous" },
    { capability: "management-api", method: "GET", pathPrefix: "/v1/projects", risk: "read" }
  ]
};

export async function runSupabaseCli(input: SupabaseCliRunInput): Promise<SupabaseRunResult> {
  const resolve = resolveContext({
    workspace: input.workspace,
    config: input.config,
    adapters: [SUPABASE_ADAPTER],
    session: input.session,
    execution: {
      kind: "cli",
      command: "supabase",
      args: input.args
    }
  });

  const policyBlock = getSupabasePolicyBlock(resolve, input.args);
  if (policyBlock) {
    return blockedCliResult(input, { ...resolve, decision: "blocked", reason: policyBlock.reason, message: policyBlock.message }, policyBlock.message);
  }

  if (resolve.decision === "blocked" || resolve.risk !== "read") {
    return blockedCliResult(input, resolve, "Supabase command blocked before execution.");
  }

  const token = await readSupabaseToken(input.secretStore, resolve);
  if (!token) {
    return blockedCliResult(input, {
      ...resolve,
      decision: "blocked",
      reason: "profile_not_configured",
      message: `Supabase token is missing for profile: ${resolve.profile ?? "unknown"}.`
    }, "Supabase token is missing.");
  }

  const processResult = await (input.runner ?? new NodeProcessRunner()).run({
    command: "supabase",
    args: input.args,
    env: {
      SUPABASE_ACCESS_TOKEN: token
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
      command: { binary: "supabase", args: input.args },
      message: `${stdout}\n${stderr}`,
      knownSecrets: [token]
    })
  };
}

export async function runSupabaseApi(input: SupabaseApiRunInput): Promise<SupabaseApiResult> {
  const resolve = resolveContext({
    workspace: input.workspace,
    config: input.config,
    adapters: [SUPABASE_ADAPTER],
    session: input.session,
    execution: {
      kind: "http",
      method: input.method,
      url: input.url
    }
  });

  if (resolve.decision === "blocked" || resolve.risk !== "read") {
    return blockedApiResult(input, resolve, "Supabase API request blocked before execution.");
  }

  const token = await readSupabaseToken(input.secretStore, resolve);
  if (!token) {
    return blockedApiResult(input, {
      ...resolve,
      decision: "blocked",
      reason: "profile_not_configured",
      message: `Supabase token is missing for profile: ${resolve.profile ?? "unknown"}.`
    }, "Supabase token is missing.");
  }

  const response = await (input.runner ?? new FetchHttpRunner()).run({
    method: input.method.toUpperCase(),
    url: input.url,
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  const body = redactForReturn(response.body, { knownSecrets: [token] }).text;

  return {
    resolve,
    status: response.status,
    body,
    executed: true,
    audit: shapeAuditEvent({
      source: "http",
      provider: resolve.provider,
      profile: resolve.profile,
      environment: resolve.environment,
      capability: resolve.capability,
      risk: resolve.risk,
      decision: resolve.decision,
      reason: resolve.reason,
      session: input.session ? { id: input.session.id, client: input.session.client } : undefined,
      request: {
        method: input.method,
        url: input.url,
        headers: { Authorization: `Bearer ${token}` }
      },
      message: body,
      knownSecrets: [token]
    })
  };
}

function getSupabasePolicyBlock(resolve: ResolveResult, args: string[]): Pick<ResolveResult, "reason" | "message"> | undefined {
  if (isGlobalAuthCommand(args)) {
    return {
      reason: "capability_not_configured",
      message: "Supabase global auth commands are not allowed by TokenValve."
    };
  }

  if (resolve.environment === "production" && resolve.risk === "write") {
    return {
      reason: "human_intent_required",
      message: "Human intent is required for Supabase production write operations."
    };
  }

  return undefined;
}

async function readSupabaseToken(secretStore: SecretStore, resolve: ResolveResult): Promise<string | null> {
  if (!resolve.profile) {
    return null;
  }
  return secretStore.readSecret(createSecretRef(getStoreName(secretStore), resolve.profile, "token"));
}

function blockedCliResult(input: SupabaseCliRunInput, resolve: ResolveResult, message: string): SupabaseRunResult {
  return {
    resolve,
    stdout: "",
    stderr: message,
    exitCode: 1,
    executed: false,
    audit: shapeAuditEvent({
      source: "cli",
      provider: resolve.provider ?? "supabase",
      profile: resolve.profile,
      environment: resolve.environment,
      capability: resolve.capability,
      risk: resolve.risk,
      decision: "blocked",
      reason: resolve.reason,
      session: input.session ? { id: input.session.id, client: input.session.client } : undefined,
      command: { binary: "supabase", args: input.args },
      message
    })
  };
}

function blockedApiResult(input: SupabaseApiRunInput, resolve: ResolveResult, message: string): SupabaseApiResult {
  return {
    resolve,
    status: 0,
    body: message,
    executed: false,
    audit: shapeAuditEvent({
      source: "http",
      provider: resolve.provider ?? "supabase",
      profile: resolve.profile,
      environment: resolve.environment,
      capability: resolve.capability,
      risk: resolve.risk,
      decision: "blocked",
      reason: resolve.reason,
      session: input.session ? { id: input.session.id, client: input.session.client } : undefined,
      request: { method: input.method, url: input.url },
      message
    })
  };
}

function isGlobalAuthCommand(args: string[]): boolean {
  return ["login", "logout"].includes(args[0] ?? "");
}

function getStoreName(store: SecretStore): string {
  return "store" in store && typeof store.store === "string" ? store.store : "secret-store";
}
