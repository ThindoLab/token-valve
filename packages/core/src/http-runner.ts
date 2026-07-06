import { shapeAuditEvent, type AuditEvent } from "./audit.js";
import { type ProcessRunner, NodeProcessRunner } from "./github-runner.js";
import { FetchHttpRunner, type HttpRunInput, type HttpRunResult, type HttpRunner } from "./supabase-runner.js";
import { redactForReturn } from "./redactor.js";
import { createSecretRef, type SecretStore } from "./secret-store.js";
import { resolveContext } from "./resolver.js";
import type { AdapterDefinition, AgentSessionContext, ResolveResult, TokenValveConfig } from "./types.js";

export type { HttpRunInput, HttpRunResult, HttpRunner };

export interface SecretTemplateMap {
  headers?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
  field?: string;
}

export interface HttpCapabilityRunInput {
  workspace: string;
  config: TokenValveConfig;
  adapters: AdapterDefinition[];
  secretStore: SecretStore;
  provider?: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  secretTemplates?: SecretTemplateMap;
  session?: AgentSessionContext;
  runner?: HttpRunner;
}

export interface CurlTemplateRunInput {
  workspace: string;
  config: TokenValveConfig;
  adapters: AdapterDefinition[];
  secretStore: SecretStore;
  provider?: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  secretTemplates?: SecretTemplateMap;
  session?: AgentSessionContext;
  runner?: ProcessRunner;
}

export interface HttpCapabilityRunResult {
  resolve: ResolveResult;
  status: number;
  body: string;
  audit: AuditEvent;
  executed: boolean;
}

export interface CurlTemplateRunResult {
  resolve: ResolveResult;
  stdout: string;
  stderr: string;
  exitCode: number;
  audit: AuditEvent;
  executed: boolean;
  command?: {
    binary: "curl";
    args: string[];
  };
}

export async function runHttpRequest(input: HttpCapabilityRunInput): Promise<HttpCapabilityRunResult> {
  const requestUrlForResolution = applyQueryTemplates(input.url, input.secretTemplates?.query, undefined);
  const resolve = resolveContext({
    workspace: input.workspace,
    config: input.config,
    adapters: input.adapters,
    session: input.session,
    execution: {
      kind: "http",
      provider: input.provider,
      method: input.method.toUpperCase(),
      url: requestUrlForResolution
    }
  });

  if (resolve.decision === "blocked" || resolve.risk !== "read") {
    return blockedHttpResult(input, resolve, "HTTP request blocked before execution.");
  }

  const token = await readProfileSecret(input.secretStore, resolve, input.secretTemplates?.field ?? "token");
  if (!token && hasTemplates(input.secretTemplates)) {
    return blockedHttpResult(input, {
      ...resolve,
      decision: "blocked",
      reason: "profile_not_configured",
      message: `Secret is missing for profile: ${resolve.profile ?? "unknown"}.`
    }, "HTTP secret is missing.");
  }

  const knownSecrets = token ? [token] : [];
  const requestUrl = applyQueryTemplates(input.url, input.secretTemplates?.query, token ?? undefined);
  const renderedHeaders = renderRecord({ ...input.headers, ...(input.secretTemplates?.headers ?? {}) }, token);
  const renderedBody = renderUnknown(input.secretTemplates?.body ?? input.body, token);
  const response = await (input.runner ?? new FetchHttpRunner()).run({
    method: input.method.toUpperCase(),
    url: requestUrl,
    headers: renderedHeaders,
    body: typeof renderedBody === "string" ? renderedBody : renderedBody === undefined ? undefined : JSON.stringify(renderedBody)
  });
  const body = redactForReturn(response.body, { knownSecrets }).text;

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
        url: requestUrl,
        headers: renderedHeaders,
        body: renderedBody
      },
      message: body,
      knownSecrets
    })
  };
}

export async function runCurlTemplate(input: CurlTemplateRunInput): Promise<CurlTemplateRunResult> {
  const requestUrlForResolution = applyQueryTemplates(input.url, input.secretTemplates?.query, undefined);
  const resolve = resolveContext({
    workspace: input.workspace,
    config: input.config,
    adapters: input.adapters,
    session: input.session,
    execution: {
      kind: "cli",
      provider: input.provider,
      command: "curl",
      args: [input.method.toUpperCase(), requestUrlForResolution]
    }
  });

  if (resolve.decision === "blocked" || resolve.risk !== "read") {
    return blockedCurlResult(input, resolve, "Curl request blocked before execution.");
  }

  const token = await readProfileSecret(input.secretStore, resolve, input.secretTemplates?.field ?? "token");
  if (!token && hasTemplates(input.secretTemplates)) {
    return blockedCurlResult(input, {
      ...resolve,
      decision: "blocked",
      reason: "profile_not_configured",
      message: `Secret is missing for profile: ${resolve.profile ?? "unknown"}.`
    }, "Curl secret is missing.");
  }

  const knownSecrets = token ? [token] : [];
  const requestUrl = applyQueryTemplates(input.url, input.secretTemplates?.query, token ?? undefined);
  const headers = renderRecord({ ...input.headers, ...(input.secretTemplates?.headers ?? {}) }, token);
  const body = renderUnknown(input.secretTemplates?.body ?? input.body, token);
  const args = buildCurlArgs(input.method, requestUrl, headers, body);
  const processResult = await (input.runner ?? new NodeProcessRunner()).run({
    command: "curl",
    args,
    env: {}
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
      binary: "curl",
      args
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
      command: { binary: "curl", args },
      message: `${stdout}\n${stderr}`,
      knownSecrets
    })
  };
}

function buildCurlArgs(method: string, url: string, headers: Record<string, string>, body: unknown): string[] {
  const args = ["--fail-with-body", "--silent", "--show-error", "--request", method.toUpperCase(), url];
  for (const [key, value] of Object.entries(headers)) {
    args.push("--header", `${key}: ${value}`);
  }
  if (body !== undefined) {
    args.push("--data", typeof body === "string" ? body : JSON.stringify(body));
  }
  return args;
}

function applyQueryTemplates(url: string, query: Record<string, string> | undefined, token: string | undefined): string {
  const parsed = new URL(url);
  for (const [key, value] of Object.entries(query ?? {})) {
    parsed.searchParams.set(key, renderTemplate(value, token));
  }
  return parsed.toString();
}

function renderRecord(record: Record<string, string>, token: string | null): Record<string, string> {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, renderTemplate(value, token ?? undefined)]));
}

function renderUnknown(value: unknown, token: string | null): unknown {
  if (typeof value === "string") {
    return renderTemplate(value, token ?? undefined);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => renderUnknown(entry, token));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, renderUnknown(entry, token)]));
  }
  return value;
}

function renderTemplate(value: string, token: string | undefined): string {
  return value.replace(/\{\{token\}\}/g, token ?? "");
}

async function readProfileSecret(secretStore: SecretStore, resolve: ResolveResult, field: string): Promise<string | null> {
  if (!resolve.profile) {
    return null;
  }
  return secretStore.readSecret(createSecretRef(getStoreName(secretStore), resolve.profile, field));
}

function hasTemplates(templates: SecretTemplateMap | undefined): boolean {
  return Boolean(templates?.headers || templates?.query || templates?.body);
}

function blockedHttpResult(input: HttpCapabilityRunInput, resolve: ResolveResult, message: string): HttpCapabilityRunResult {
  return {
    resolve,
    status: 0,
    body: message,
    executed: false,
    audit: shapeAuditEvent({
      source: "http",
      provider: resolve.provider,
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

function blockedCurlResult(input: CurlTemplateRunInput, resolve: ResolveResult, message: string): CurlTemplateRunResult {
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
      session: input.session ? { id: input.session.id, client: input.session.client } : undefined,
      command: { binary: "curl", args: [input.method, input.url] },
      message
    })
  };
}

function getStoreName(store: SecretStore): string {
  return "store" in store && typeof store.store === "string" ? store.store : "secret-store";
}
