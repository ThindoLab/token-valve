import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";
import { shapeAuditEvent, type AuditEvent } from "./audit.js";
import { resolveContext } from "./resolver.js";
import type { AdapterDefinition, ResolveResult, TokenValveConfig } from "./types.js";

export interface GlobalSwitchHandler {
  snapshot(): Promise<GlobalSwitchSnapshot>;
  switchTo(profile: string): Promise<void>;
  run(): Promise<{ stdout: string; stderr: string; exitCode: number }>;
  restore(snapshot: GlobalSwitchSnapshot): Promise<void>;
}

export interface GlobalSwitchSnapshot {
  summary: string;
}

export interface GlobalSwitchInput {
  configDir: string;
  workspace: string;
  config: TokenValveConfig;
  adapter: AdapterDefinition;
  provider: string;
  command: string;
  args: string[];
  ttlMs?: number;
  holder?: string;
  handler: GlobalSwitchHandler;
  now?: () => Date;
}

export interface GlobalSwitchResult {
  resolve: ResolveResult;
  stdout: string;
  stderr: string;
  exitCode: number;
  executed: boolean;
  restored: boolean;
  repairSuggestions: string[];
  audit: AuditEvent;
}

interface GlobalSwitchLock {
  provider: string;
  holder: string;
  expiresAt: string;
  snapshot?: string;
}

const DEFAULT_TTL_MS = 30_000;

export async function runWithGlobalSwitch(input: GlobalSwitchInput): Promise<GlobalSwitchResult> {
  const now = input.now ?? (() => new Date());
  const resolve = resolveContext({
    workspace: input.workspace,
    config: input.config,
    adapters: [input.adapter],
    execution: {
      kind: "cli",
      provider: input.provider,
      command: input.command,
      args: input.args
    }
  });

  if (!input.adapter.executionModes?.includes("global-switch")) {
    return blocked(input, resolve, "Adapter has not opted in to global-switch execution.", ["Use env-injection or isolated-config, or explicitly enable global-switch in the adapter."]);
  }
  if (resolve.decision === "blocked") {
    return blocked(input, resolve, "Global switch blocked before execution.", [resolve.message]);
  }
  if (!resolve.profile) {
    return blocked(input, resolve, "Profile is missing for global switch.", ["Configure a verified profile before using global-switch."]);
  }

  const lockPath = getLockPath(input.configDir, input.provider);
  const existingLock = readLock(lockPath);
  if (existingLock && new Date(existingLock.expiresAt).getTime() > now().getTime()) {
    return blocked(input, {
      ...resolve,
      decision: "blocked",
      reason: "human_intent_required",
      message: `Global switch lock is held for provider: ${input.provider}.`
    }, "Global switch lock conflict.", ["Wait for the lock TTL to expire, or run doctor to inspect stale locks."]);
  }

  const holder = input.holder ?? `global-switch-${process.pid}`;
  const expiresAt = new Date(now().getTime() + (input.ttlMs ?? DEFAULT_TTL_MS)).toISOString();
  let snapshot: GlobalSwitchSnapshot | undefined;
  let restored = false;
  try {
    snapshot = await input.handler.snapshot();
    writeLock(lockPath, { provider: input.provider, holder, expiresAt, snapshot: snapshot.summary });
    await input.handler.switchTo(resolve.profile);
    const run = await input.handler.run();
    await input.handler.restore(snapshot);
    restored = true;
    removeLock(lockPath);
    return complete(input, resolve, run.stdout, run.stderr, run.exitCode, true, restored, []);
  } catch (error) {
    const repairSuggestions = [`Global switch failed: ${error instanceof Error ? error.message : String(error)}.`, "Check provider global auth state and run doctor before retrying."];
    if (snapshot && !restored) {
      try {
        await input.handler.restore(snapshot);
        restored = true;
      } catch (restoreError) {
        repairSuggestions.push(`Restore failed: ${restoreError instanceof Error ? restoreError.message : String(restoreError)}.`);
      }
    }
    removeLock(lockPath);
    return complete(input, resolve, "", repairSuggestions.join("\n"), 1, false, restored, repairSuggestions);
  }
}

function complete(
  input: GlobalSwitchInput,
  resolve: ResolveResult,
  stdout: string,
  stderr: string,
  exitCode: number,
  executed: boolean,
  restored: boolean,
  repairSuggestions: string[]
): GlobalSwitchResult {
  return {
    resolve,
    stdout,
    stderr,
    exitCode,
    executed,
    restored,
    repairSuggestions,
    audit: shapeAuditEvent({
      source: "cli",
      provider: resolve.provider ?? input.provider,
      profile: resolve.profile,
      environment: resolve.environment,
      capability: resolve.capability,
      risk: resolve.risk,
      decision: executed ? "allow" : "blocked",
      reason: resolve.reason,
      command: { binary: input.command, args: input.args },
      message: `${stdout}\n${stderr}`
    })
  };
}

function blocked(input: GlobalSwitchInput, resolve: ResolveResult, stderr: string, repairSuggestions: string[]): GlobalSwitchResult {
  return complete(input, resolve, "", stderr, 1, false, false, repairSuggestions);
}

function getLockPath(configDir: string, provider: string): string {
  return path.join(configDir, "runtime", "global-switch-locks", `${provider}.yaml`);
}

function readLock(lockPath: string): GlobalSwitchLock | undefined {
  if (!existsSync(lockPath)) {
    return undefined;
  }
  return parse(readFileSync(lockPath, "utf8")) as GlobalSwitchLock;
}

function writeLock(lockPath: string, lock: GlobalSwitchLock): void {
  mkdirSync(path.dirname(lockPath), { recursive: true });
  writeFileSync(lockPath, stringify(lock), "utf8");
}

function removeLock(lockPath: string): void {
  if (existsSync(lockPath)) {
    rmSync(lockPath);
  }
}
