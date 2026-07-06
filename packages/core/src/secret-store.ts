import { spawn } from "node:child_process";
import { redactText } from "./redactor.js";

export interface SecretRef {
  store: string;
  key: string;
  profileId: string;
  field: string;
}

export interface SecretMetadata {
  provider?: string;
  environment?: string;
  displayName?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SecretRecord {
  ref: SecretRef;
  value: string;
  metadata?: SecretMetadata;
}

export interface SecretListEntry {
  ref: SecretRef;
  metadata?: SecretMetadata;
}

export interface WriteSecretInput {
  profileId: string;
  field: string;
  value: string;
  metadata?: SecretMetadata;
}

export interface SecretStore {
  writeSecret(input: WriteSecretInput): Promise<SecretRef>;
  readSecret(ref: SecretRef): Promise<string | null>;
  updateSecret(ref: SecretRef, value: string, metadata?: SecretMetadata): Promise<SecretRef>;
  deleteSecret(ref: SecretRef): Promise<boolean>;
  listSecretRefs(): Promise<SecretListEntry[]>;
}

export class SecretStoreError extends Error {
  public readonly operation: string;
  public readonly store: string;

  public constructor(store: string, operation: string, message: string) {
    super(`${store} ${operation} failed: ${message}`);
    this.name = "SecretStoreError";
    this.store = store;
    this.operation = operation;
  }
}

export class MemorySecretStore implements SecretStore {
  public readonly store = "memory";

  private readonly records = new Map<string, SecretRecord>();

  public async writeSecret(input: WriteSecretInput): Promise<SecretRef> {
    const ref = createSecretRef(this.store, input.profileId, input.field);
    this.records.set(ref.key, {
      ref,
      value: input.value,
      metadata: withTimestamps(input.metadata)
    });
    return ref;
  }

  public async readSecret(ref: SecretRef): Promise<string | null> {
    return this.records.get(ref.key)?.value ?? null;
  }

  public async updateSecret(ref: SecretRef, value: string, metadata?: SecretMetadata): Promise<SecretRef> {
    const existing = this.records.get(ref.key);
    if (!existing) {
      this.records.set(ref.key, {
        ref,
        value,
        metadata: withTimestamps(metadata)
      });
      return ref;
    }

    this.records.set(ref.key, {
      ref,
      value,
      metadata: withTimestamps({
        ...existing.metadata,
        ...metadata,
        createdAt: existing.metadata?.createdAt
      })
    });
    return ref;
  }

  public async deleteSecret(ref: SecretRef): Promise<boolean> {
    return this.records.delete(ref.key);
  }

  public async listSecretRefs(): Promise<SecretListEntry[]> {
    return [...this.records.values()].map((record) => ({
      ref: record.ref,
      metadata: record.metadata
    }));
  }
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface CommandRunner {
  run(command: string, args: string[], input?: string): Promise<CommandResult>;
}

export class NodeCommandRunner implements CommandRunner {
  public async run(command: string, args: string[], input?: string): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
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

      if (input) {
        child.stdin.write(input);
      }
      child.stdin.end();
    });
  }
}

export interface MacOSKeychainSecretStoreOptions {
  service?: string;
  runner?: CommandRunner;
}

export class MacOSKeychainSecretStore implements SecretStore {
  public readonly store = "macos-keychain";

  private readonly service: string;
  private readonly runner: CommandRunner;
  private readonly metadata = new Map<string, SecretMetadata | undefined>();

  public constructor(options: MacOSKeychainSecretStoreOptions = {}) {
    this.service = options.service ?? "TokenValve";
    this.runner = options.runner ?? new NodeCommandRunner();
  }

  public async writeSecret(input: WriteSecretInput): Promise<SecretRef> {
    const ref = createSecretRef(this.store, input.profileId, input.field);
    const result = await this.runner.run("security", [
      "add-generic-password",
      "-a",
      ref.key,
      "-s",
      this.service,
      "-w",
      input.value,
      "-U"
    ]);
    assertCommandSuccess(this.store, "writeSecret", result, [input.value]);
    this.metadata.set(ref.key, withTimestamps(input.metadata));
    return ref;
  }

  public async readSecret(ref: SecretRef): Promise<string | null> {
    const result = await this.runner.run("security", [
      "find-generic-password",
      "-a",
      ref.key,
      "-s",
      this.service,
      "-w"
    ]);

    if (result.exitCode !== 0) {
      return null;
    }

    return result.stdout.replace(/\n$/, "");
  }

  public async updateSecret(ref: SecretRef, value: string, metadata?: SecretMetadata): Promise<SecretRef> {
    const result = await this.runner.run("security", [
      "add-generic-password",
      "-a",
      ref.key,
      "-s",
      this.service,
      "-w",
      value,
      "-U"
    ]);
    assertCommandSuccess(this.store, "updateSecret", result, [value]);
    this.metadata.set(ref.key, withTimestamps({
      ...this.metadata.get(ref.key),
      ...metadata,
      createdAt: this.metadata.get(ref.key)?.createdAt
    }));
    return ref;
  }

  public async deleteSecret(ref: SecretRef): Promise<boolean> {
    const result = await this.runner.run("security", [
      "delete-generic-password",
      "-a",
      ref.key,
      "-s",
      this.service
    ]);

    if (result.exitCode !== 0) {
      return false;
    }

    this.metadata.delete(ref.key);
    return true;
  }

  public async listSecretRefs(): Promise<SecretListEntry[]> {
    return [...this.metadata.entries()].map(([key, metadata]) => ({
      ref: parseSecretKey(this.store, key),
      metadata
    }));
  }
}

export function createSecretRef(store: string, profileId: string, field: string): SecretRef {
  return {
    store,
    key: `${profileId}:${field}`,
    profileId,
    field
  };
}

function parseSecretKey(store: string, key: string): SecretRef {
  const separatorIndex = key.lastIndexOf(":");
  const profileId = separatorIndex >= 0 ? key.slice(0, separatorIndex) : key;
  const field = separatorIndex >= 0 ? key.slice(separatorIndex + 1) : "value";
  return { store, key, profileId, field };
}

function withTimestamps(metadata: SecretMetadata | undefined): SecretMetadata {
  const now = new Date().toISOString();
  return {
    ...metadata,
    createdAt: metadata?.createdAt ?? now,
    updatedAt: now
  };
}

function assertCommandSuccess(store: string, operation: string, result: CommandResult, knownSecrets: string[] = []): void {
  if (result.exitCode === 0) {
    return;
  }

  throw new SecretStoreError(store, operation, sanitizeCommandError(result.stderr || result.stdout || "command failed", knownSecrets));
}

function sanitizeCommandError(message: string, knownSecrets: string[]): string {
  return redactText(message.replace(/\s+/g, " ").trim(), { knownSecrets }).text || "command failed";
}
