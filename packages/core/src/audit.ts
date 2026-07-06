import { redactJsonValue, redactText, type RedactionOptions } from "./redactor.js";
import type { Decision, RiskLevel } from "./types.js";

export type AuditSource = "cli" | "shim" | "mcp" | "http" | "ssh" | "core";

export interface AuditEventInput {
  timestamp?: string;
  source: AuditSource;
  provider?: string;
  profile?: string;
  environment?: string;
  capability?: string;
  risk?: RiskLevel;
  decision: Decision;
  reason?: string;
  session?: {
    id: string;
    client?: string;
  };
  command?: {
    binary: string;
    args: string[];
  };
  request?: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: unknown;
  };
  operation?: {
    type: "ssh" | "git-ssh" | "script";
    target?: string;
    command?: string;
    metadata?: Record<string, unknown>;
  };
  intent?: {
    id: string;
    expiresAt: string;
  };
  message?: string;
  knownSecrets?: string[];
}

export interface AuditEvent {
  timestamp: string;
  source: AuditSource;
  provider?: string;
  profile?: string;
  environment?: string;
  capability?: string;
  risk?: RiskLevel;
  decision: Decision;
  reason?: string;
  session?: {
    id: string;
    client?: string;
  };
  command?: {
    binary: string;
    argsRedacted: string[];
  };
  request?: {
    method: string;
    host: string;
    path: string;
    headersRedacted?: Record<string, string>;
    bodyRedacted?: unknown;
  };
  operation?: {
    type: "ssh" | "git-ssh" | "script";
    targetRedacted?: string;
    commandRedacted?: string;
    metadataRedacted?: Record<string, unknown>;
  };
  intent?: {
    id: string;
    expiresAt: string;
  };
  messageRedacted?: string;
}

export function shapeAuditEvent(input: AuditEventInput): AuditEvent {
  const redactionOptions: RedactionOptions = { knownSecrets: input.knownSecrets };
  const event: AuditEvent = {
    timestamp: input.timestamp ?? new Date().toISOString(),
    source: input.source,
    provider: input.provider,
    profile: input.profile,
    environment: input.environment,
    capability: input.capability,
    risk: input.risk,
    decision: input.decision,
    reason: input.reason,
    session: input.session
  };

  if (input.command) {
    event.command = {
      binary: input.command.binary,
      argsRedacted: input.command.args.map((arg) => redactText(arg, redactionOptions).text)
    };
  }

  if (input.request) {
    const url = new URL(redactText(input.request.url, redactionOptions).text);
    event.request = {
      method: input.request.method.toUpperCase(),
      host: url.host,
      path: `${url.pathname}${url.search}`,
      headersRedacted: input.request.headers
        ? redactHeaders(input.request.headers, redactionOptions)
        : undefined,
      bodyRedacted: input.request.body === undefined
        ? undefined
        : redactJsonValue(input.request.body, redactionOptions)
    };
  }

  if (input.operation) {
    event.operation = {
      type: input.operation.type,
      targetRedacted: input.operation.target
        ? redactText(input.operation.target, redactionOptions).text
        : undefined,
      commandRedacted: input.operation.command
        ? redactText(input.operation.command, redactionOptions).text
        : undefined,
      metadataRedacted: input.operation.metadata
        ? redactJsonValue(input.operation.metadata, redactionOptions)
        : undefined
    };
  }

  if (input.intent) {
    event.intent = input.intent;
  }

  if (input.message) {
    event.messageRedacted = redactText(input.message, redactionOptions).text;
  }

  return pruneUndefined(event);
}

function redactHeaders(headers: Record<string, string>, options: RedactionOptions): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => {
      if (key.toLowerCase() === "authorization") {
        return [key, value.replace(/^(\s*(?:Bearer|Token|Basic)\s+).+$/i, "$1[REDACTED:authorization]")];
      }

      return [key, redactText(value, options).text];
    })
  );
}

function pruneUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => pruneUndefined(entry)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, pruneUndefined(entry)])
    ) as T;
  }

  return value;
}
