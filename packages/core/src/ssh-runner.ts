import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { shapeAuditEvent, type AuditEvent } from "./audit.js";
import { type ProcessRunner, NodeProcessRunner } from "./github-runner.js";
import { redactForReturn } from "./redactor.js";
import { createSecretRef, type SecretStore } from "./secret-store.js";
import { resolveContext } from "./resolver.js";
import type { AdapterDefinition, AgentSessionContext, ResolveResult, TokenValveConfig } from "./types.js";

export type KnownHostsPolicy =
  | { mode: "strict"; file: string }
  | { mode: "accept-new"; file?: string }
  | { mode: "off" };

export interface SshCredentialFields {
  identityFileField?: string;
  privateKeyField?: string;
  agentSocketField?: string;
}

export interface SshCommandRunInput {
  workspace: string;
  config: TokenValveConfig;
  secretStore: SecretStore;
  host: string;
  user?: string;
  port?: number;
  operation?: string;
  command?: string[];
  provider?: string;
  adapters?: AdapterDefinition[];
  knownHosts?: KnownHostsPolicy;
  credentialFields?: SshCredentialFields;
  session?: AgentSessionContext;
  runner?: ProcessRunner;
}

export interface GitSshRunInput {
  workspace: string;
  config: TokenValveConfig;
  secretStore: SecretStore;
  remoteUrl: string;
  operation: string;
  gitArgs?: string[];
  provider?: string;
  adapters?: AdapterDefinition[];
  knownHosts?: KnownHostsPolicy;
  credentialFields?: SshCredentialFields;
  session?: AgentSessionContext;
  runner?: ProcessRunner;
}

export interface SshRunResult {
  resolve: ResolveResult;
  stdout: string;
  stderr: string;
  exitCode: number;
  audit: AuditEvent;
  executed: boolean;
  command?: {
    binary: "ssh" | "git";
    args: string[];
    env: Record<string, string>;
  };
}

export const SSH_ADAPTER: AdapterDefinition = {
  provider: "github",
  capabilities: [
    {
      id: "github-ssh-command",
      type: "ssh-command",
      allowedHosts: ["github.com"],
      operations: ["connect", "read"]
    },
    {
      id: "github-git-ssh",
      type: "git-ssh",
      allowedHosts: ["github.com"],
      operations: ["fetch", "ls-remote", "push"]
    }
  ],
  riskRules: [
    { capability: "github-ssh-command", operation: "connect", risk: "read" },
    { capability: "github-ssh-command", operation: "read", risk: "read" },
    { capability: "github-git-ssh", operation: "fetch", risk: "read" },
    { capability: "github-git-ssh", operation: "ls-remote", risk: "read" },
    { capability: "github-git-ssh", operation: "push", risk: "write" }
  ]
};

export async function runSshCommand(input: SshCommandRunInput): Promise<SshRunResult> {
  const resolve = resolveContext({
    workspace: input.workspace,
    config: input.config,
    adapters: input.adapters ?? [SSH_ADAPTER],
    session: input.session,
    execution: {
      kind: "host-operation",
      type: "ssh-command",
      provider: input.provider,
      host: input.host,
      operation: input.operation ?? "connect"
    }
  });

  const preflight = getPolicyBlock(resolve, input.knownHosts);
  if (preflight) {
    return blockedResult(input, { ...resolve, decision: "blocked", reason: preflight.reason, message: preflight.message }, preflight.message, "ssh");
  }

  if (resolve.decision === "blocked" || resolve.risk !== "read") {
    return blockedResult(input, resolve, "SSH operation blocked before execution.", "ssh");
  }

  const credential = await readSshCredential(input.secretStore, resolve, input.credentialFields);
  if (!credential.hasCredential) {
    return blockedResult(input, {
      ...resolve,
      decision: "blocked",
      reason: "profile_not_configured",
      message: `SSH credential is missing for profile: ${resolve.profile ?? "unknown"}.`
    }, "SSH credential is missing.", "ssh");
  }

  const tempFiles: string[] = [];
  try {
    const keyFile = credential.privateKey
      ? await writeTemporaryKey(credential.privateKey, tempFiles)
      : credential.identityFile;
    const args = [
      ...buildSshOptions({
        knownHosts: input.knownHosts,
        identityFile: keyFile,
        port: input.port
      }),
      formatSshTarget(input.user, input.host),
      ...(input.command ?? [])
    ];
    const env: Record<string, string> = credential.agentSocket ? { SSH_AUTH_SOCK: credential.agentSocket } : {};
    const processResult = await (input.runner ?? new NodeProcessRunner()).run({
      command: "ssh",
      args,
      env
    });
    const knownSecrets = knownSecretValues(credential, keyFile);
    const stdout = redactForReturn(processResult.stdout, { knownSecrets }).text;
    const stderr = redactForReturn(processResult.stderr, { knownSecrets }).text;

    return {
      resolve,
      stdout,
      stderr,
      exitCode: processResult.exitCode,
      executed: true,
      command: { binary: "ssh", args, env },
      audit: shapeAuditEvent({
        source: "ssh",
        provider: resolve.provider,
        profile: resolve.profile,
        environment: resolve.environment,
        capability: resolve.capability,
        risk: resolve.risk,
        decision: resolve.decision,
        reason: resolve.reason,
        session: input.session ? { id: input.session.id, client: input.session.client } : undefined,
        operation: {
          type: "ssh",
          target: formatSshTarget(input.user, input.host),
          command: input.command?.join(" "),
          metadata: { host: input.host, user: input.user, port: input.port, operation: input.operation }
        },
        message: `${stdout}\n${stderr}`,
        knownSecrets
      })
    };
  } finally {
    await cleanupTempFiles(tempFiles);
  }
}

export async function runGitSsh(input: GitSshRunInput): Promise<SshRunResult> {
  const host = parseSshRemoteHost(input.remoteUrl);
  const resolve = resolveContext({
    workspace: input.workspace,
    config: input.config,
    adapters: input.adapters ?? [SSH_ADAPTER],
    session: input.session,
    execution: {
      kind: "host-operation",
      type: "git-ssh",
      provider: input.provider,
      host,
      operation: input.operation
    }
  });

  const preflight = getPolicyBlock(resolve, input.knownHosts);
  if (preflight) {
    return blockedResult(input, { ...resolve, decision: "blocked", reason: preflight.reason, message: preflight.message }, preflight.message, "git");
  }

  if (resolve.environment === "production" && resolve.risk === "write") {
    return blockedResult(input, {
      ...resolve,
      decision: "blocked",
      reason: "human_intent_required",
      message: "Human intent is required for production git over SSH write operations."
    }, "Human intent is required for production git over SSH write operations.", "git");
  }

  if (resolve.decision === "blocked" || resolve.risk !== "read") {
    return blockedResult(input, resolve, "Git over SSH operation blocked before execution.", "git");
  }

  const credential = await readSshCredential(input.secretStore, resolve, input.credentialFields);
  if (!credential.hasCredential) {
    return blockedResult(input, {
      ...resolve,
      decision: "blocked",
      reason: "profile_not_configured",
      message: `SSH credential is missing for profile: ${resolve.profile ?? "unknown"}.`
    }, "SSH credential is missing.", "git");
  }

  const tempFiles: string[] = [];
  try {
    const keyFile = credential.privateKey
      ? await writeTemporaryKey(credential.privateKey, tempFiles)
      : credential.identityFile;
    const sshCommand = buildGitSshCommand(input.knownHosts, keyFile);
    const args = input.gitArgs ?? defaultGitArgs(input.operation, input.remoteUrl);
    const env = {
      GIT_SSH_COMMAND: sshCommand,
      ...(credential.agentSocket ? { SSH_AUTH_SOCK: credential.agentSocket } : {})
    };
    const processResult = await (input.runner ?? new NodeProcessRunner()).run({
      command: "git",
      args,
      env
    });
    const knownSecrets = knownSecretValues(credential, keyFile);
    const stdout = redactForReturn(processResult.stdout, { knownSecrets }).text;
    const stderr = redactForReturn(processResult.stderr, { knownSecrets }).text;

    return {
      resolve,
      stdout,
      stderr,
      exitCode: processResult.exitCode,
      executed: true,
      command: { binary: "git", args, env },
      audit: shapeAuditEvent({
        source: "ssh",
        provider: resolve.provider,
        profile: resolve.profile,
        environment: resolve.environment,
        capability: resolve.capability,
        risk: resolve.risk,
        decision: resolve.decision,
        reason: resolve.reason,
        session: input.session ? { id: input.session.id, client: input.session.client } : undefined,
        operation: {
          type: "git-ssh",
          target: input.remoteUrl,
          command: `git ${args.join(" ")}`,
          metadata: { host, operation: input.operation }
        },
        message: `${stdout}\n${stderr}`,
        knownSecrets
      })
    };
  } finally {
    await cleanupTempFiles(tempFiles);
  }
}

function getPolicyBlock(resolve: ResolveResult, knownHosts: KnownHostsPolicy | undefined): Pick<ResolveResult, "reason" | "message"> | undefined {
  if (!knownHosts) {
    return {
      reason: "capability_not_configured",
      message: "SSH known_hosts policy must be configured explicitly."
    };
  }

  if (knownHosts.mode === "strict" && !knownHosts.file) {
    return {
      reason: "capability_not_configured",
      message: "Strict SSH known_hosts policy requires a known_hosts file."
    };
  }

  if (knownHosts.mode === "off" && resolve.environment === "production") {
    return {
      reason: "human_intent_required",
      message: "Human intent is required to disable SSH host key checking in production."
    };
  }

  return undefined;
}

interface ResolvedSshCredential {
  identityFile?: string;
  privateKey?: string;
  agentSocket?: string;
  hasCredential: boolean;
}

async function readSshCredential(
  secretStore: SecretStore,
  resolve: ResolveResult,
  fields: SshCredentialFields | undefined
): Promise<ResolvedSshCredential> {
  if (!resolve.profile) {
    return { hasCredential: false };
  }

  const identityFile = await readOptionalSecret(secretStore, resolve.profile, fields?.identityFileField ?? "identity_file");
  const privateKey = await readOptionalSecret(secretStore, resolve.profile, fields?.privateKeyField ?? "private_key");
  const agentSocket = await readOptionalSecret(secretStore, resolve.profile, fields?.agentSocketField ?? "agent_socket");

  return {
    identityFile: identityFile ?? undefined,
    privateKey: privateKey ?? undefined,
    agentSocket: agentSocket ?? undefined,
    hasCredential: Boolean(identityFile || privateKey || agentSocket)
  };
}

async function readOptionalSecret(secretStore: SecretStore, profile: string, field: string): Promise<string | null> {
  return secretStore.readSecret(createSecretRef(getStoreName(secretStore), profile, field));
}

function buildSshOptions(input: { knownHosts: KnownHostsPolicy | undefined; identityFile: string | undefined; port: number | undefined }): string[] {
  const args: string[] = ["-o", "BatchMode=yes"];
  if (input.identityFile) {
    args.push("-i", input.identityFile);
  }
  if (input.port) {
    args.push("-p", String(input.port));
  }
  args.push(...knownHostsArgs(input.knownHosts));
  return args;
}

function knownHostsArgs(policy: KnownHostsPolicy | undefined): string[] {
  if (!policy) {
    return [];
  }
  if (policy.mode === "strict") {
    return ["-o", "StrictHostKeyChecking=yes", "-o", `UserKnownHostsFile=${policy.file}`];
  }
  if (policy.mode === "accept-new") {
    return [
      "-o",
      "StrictHostKeyChecking=accept-new",
      ...(policy.file ? ["-o", `UserKnownHostsFile=${policy.file}`] : [])
    ];
  }
  return ["-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null"];
}

function buildGitSshCommand(knownHosts: KnownHostsPolicy | undefined, identityFile: string | undefined): string {
  return ["ssh", ...buildSshOptions({ knownHosts, identityFile, port: undefined })].join(" ");
}

async function writeTemporaryKey(privateKey: string, tempFiles: string[]): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "tokenvalve-ssh-"));
  const file = path.join(dir, "identity");
  await writeFile(file, privateKey, { mode: 0o600 });
  tempFiles.push(dir);
  return file;
}

async function cleanupTempFiles(paths: string[]): Promise<void> {
  await Promise.all(paths.map((entry) => rm(entry, { recursive: true, force: true })));
}

function parseSshRemoteHost(remoteUrl: string): string {
  const scpLike = remoteUrl.match(/^[^@\s]+@([^:\s]+):.+$/);
  if (scpLike) {
    return scpLike[1] ?? "";
  }
  const parsed = new URL(remoteUrl);
  return parsed.hostname;
}

function defaultGitArgs(operation: string, remoteUrl: string): string[] {
  if (operation === "ls-remote") {
    return ["ls-remote", remoteUrl];
  }
  if (operation === "push") {
    return ["push", remoteUrl];
  }
  return ["fetch", remoteUrl];
}

function formatSshTarget(user: string | undefined, host: string): string {
  return user ? `${user}@${host}` : host;
}

function knownSecretValues(credential: ResolvedSshCredential, keyFile: string | undefined): string[] {
  return [credential.identityFile, credential.privateKey, credential.agentSocket, keyFile].filter((value): value is string => Boolean(value));
}

function blockedResult(
  input: SshCommandRunInput | GitSshRunInput,
  resolve: ResolveResult,
  message: string,
  binary: "ssh" | "git"
): SshRunResult {
  return {
    resolve: {
      ...resolve,
      decision: "blocked"
    },
    stdout: "",
    stderr: message,
    exitCode: 1,
    executed: false,
    audit: shapeAuditEvent({
      source: "ssh",
      provider: resolve.provider ?? input.provider ?? "github",
      profile: resolve.profile,
      environment: resolve.environment,
      capability: resolve.capability,
      risk: resolve.risk,
      decision: "blocked",
      reason: resolve.reason,
      session: input.session ? { id: input.session.id, client: input.session.client } : undefined,
      operation: {
        type: binary === "git" ? "git-ssh" : "ssh",
        target: "remoteUrl" in input ? input.remoteUrl : input.host,
        command: "remoteUrl" in input ? input.gitArgs?.join(" ") : input.command?.join(" "),
        metadata: {
          operation: input.operation
        }
      },
      message
    })
  };
}

function getStoreName(store: SecretStore): string {
  return "store" in store && typeof store.store === "string" ? store.store : "secret-store";
}
