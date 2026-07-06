import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";
import { shapeAuditEvent, type AuditEvent } from "./audit.js";
import type { HumanIntentGrant, HumanIntentScope, RiskLevel } from "./types.js";

export interface HumanIntentFiles {
  intents: HumanIntentGrant[];
}

export interface HumanIntentStoreOptions {
  configDir: string;
  now?: () => Date;
}

export interface CreateHumanIntentInput {
  workspace: string;
  provider: string;
  profile: string;
  environment: string;
  risk: RiskLevel;
  ttl: string;
  yes: boolean;
}

export interface RevokeHumanIntentInput {
  id: string;
  yes: boolean;
}

export interface HumanIntentChangeResult {
  intent: HumanIntentGrant;
  audit: AuditEvent;
}

const TTL_PATTERN = /^(\d+)(s|m|h)$/;

export class HumanIntentStore {
  private readonly configDir: string;
  private readonly now: () => Date;

  public constructor(options: HumanIntentStoreOptions) {
    this.configDir = options.configDir;
    this.now = options.now ?? (() => new Date());
  }

  public list(): HumanIntentGrant[] {
    const now = this.now();
    return this.readFiles().intents.map((intent) => markExpired(intent, now));
  }

  public create(input: CreateHumanIntentInput): HumanIntentChangeResult {
    requireYes(input.yes, "create human intent");
    const now = this.now();
    const scope: HumanIntentScope = {
      workspace: canonicalizeWorkspace(assertNonEmpty(input.workspace, "workspace")),
      provider: assertNonEmpty(input.provider, "provider"),
      profile: assertNonEmpty(input.profile, "profile"),
      environment: assertNonEmpty(input.environment, "environment"),
      risk: input.risk
    };
    const intent: HumanIntentGrant = {
      id: `intent_${randomUUID()}`,
      status: "active",
      source: "cli",
      scope,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + parseTtlMs(input.ttl)).toISOString()
    };
    const files = this.readFiles();
    files.intents = [...files.intents.map((entry) => markExpired(entry, now)), intent];
    this.writeFiles(files);
    return {
      intent,
      audit: humanIntentAudit("created", intent)
    };
  }

  public revoke(input: RevokeHumanIntentInput): HumanIntentChangeResult {
    requireYes(input.yes, "revoke human intent");
    const files = this.readFiles();
    const now = this.now();
    const existing = files.intents.find((intent) => intent.id === input.id);
    if (!existing) {
      throw new Error(`Human intent not found: ${input.id}.`);
    }
    const revoked: HumanIntentGrant = {
      ...markExpired(existing, now),
      status: "revoked",
      revokedAt: now.toISOString()
    };
    files.intents = files.intents.map((intent) => intent.id === input.id ? revoked : markExpired(intent, now));
    this.writeFiles(files);
    return {
      intent: revoked,
      audit: humanIntentAudit("revoked", revoked)
    };
  }

  private readFiles(): HumanIntentFiles {
    return readYaml(path.join(this.configDir, "intents.yaml"), { intents: [] });
  }

  private writeFiles(files: HumanIntentFiles): void {
    mkdirSync(this.configDir, { recursive: true });
    writeFileSync(path.join(this.configDir, "intents.yaml"), stringify(files), "utf8");
  }
}

export function findMatchingHumanIntent(
  intents: HumanIntentGrant[] | undefined,
  scope: HumanIntentScope,
  nowInput: string | Date = new Date()
): HumanIntentGrant | undefined {
  const now = typeof nowInput === "string" ? new Date(nowInput) : nowInput;
  return intents
    ?.map((intent) => markExpired(intent, now))
    .find((intent) => intent.status === "active" && scopesMatch(intent.scope, scope));
}

export function parseTtlMs(value: string): number {
  const match = value.match(TTL_PATTERN);
  if (!match) {
    throw new Error(`Unsupported TTL: ${value}. Use values like 30s, 10m, or 2h.`);
  }
  const amount = Number.parseInt(match[1] ?? "0", 10);
  const unit = match[2];
  const multiplier = unit === "s" ? 1_000 : unit === "m" ? 60_000 : 3_600_000;
  return amount * multiplier;
}

export function humanIntentAudit(action: "created" | "used" | "revoked", intent: HumanIntentGrant): AuditEvent {
  return shapeAuditEvent({
    source: "core",
    provider: intent.scope.provider,
    profile: intent.scope.profile,
    environment: intent.scope.environment,
    risk: intent.scope.risk,
    decision: action === "revoked" ? "blocked" : "allow",
    reason: `human_intent_${action}`,
    operation: {
      type: "script",
      target: intent.scope.workspace,
      command: `human-intent:${action}`,
      metadata: {
        id: intent.id,
        status: intent.status,
        source: intent.source,
        expiresAt: intent.expiresAt
      }
    },
    intent: {
      id: intent.id,
      expiresAt: intent.expiresAt
    }
  });
}

function scopesMatch(left: HumanIntentScope, right: HumanIntentScope): boolean {
  return left.workspace === canonicalizeWorkspace(right.workspace)
    && left.provider === right.provider
    && left.profile === right.profile
    && left.environment === right.environment
    && left.risk === right.risk;
}

function markExpired(intent: HumanIntentGrant, now: Date): HumanIntentGrant {
  if (intent.status !== "active") {
    return intent;
  }
  return new Date(intent.expiresAt).getTime() <= now.getTime()
    ? { ...intent, status: "expired" }
    : intent;
}

function assertNonEmpty(value: string, label: string): string {
  if (!value.trim()) {
    throw new Error(`${label} is required.`);
  }
  return value;
}

function requireYes(yes: boolean, action: string): void {
  if (!yes) {
    throw new Error(`Refusing to ${action} without --yes.`);
  }
}

function readYaml<T>(filePath: string, fallback: T): T {
  try {
    return parse(readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function canonicalizeWorkspace(workspace: string): string {
  const resolved = path.resolve(workspace);
  if (!existsSync(resolved)) {
    return stripTrailingSeparator(resolved);
  }
  return stripTrailingSeparator(realpathSync.native(resolved));
}

function stripTrailingSeparator(value: string): string {
  return value.length > 1 ? value.replace(/[\\/]+$/, "") : value;
}
