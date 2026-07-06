import { describe, expect, it } from "vitest";
import { type ProcessRunInput, type ProcessRunner } from "./github-runner.js";
import { MemorySecretStore } from "./secret-store.js";
import { runGitSsh, runSshCommand } from "./ssh-runner.js";
import type { AdapterDefinition, TokenValveConfig } from "./types.js";

const WORKSPACE = "/workspaces/token-valve";
const IDENTITY_FILE = "/Users/xing/.ssh/tokenvalve_work";
const AGENT_SOCKET = "/tmp/tokenvalve.sock";
const PRIVATE_KEY = "-----BEGIN OPENSSH PRIVATE KEY-----\nsecret\n-----END OPENSSH PRIVATE KEY-----";

class FakeProcessRunner implements ProcessRunner {
  public readonly calls: ProcessRunInput[] = [];

  public async run(input: ProcessRunInput) {
    this.calls.push(input);
    return {
      stdout: `ok -i ${IDENTITY_FILE} SSH_AUTH_SOCK=${AGENT_SOCKET} git@github.com:ThindoLab/private.git`,
      stderr: "",
      exitCode: 0
    };
  }
}

async function makeStore(fields: Partial<Record<"identity_file" | "agent_socket" | "private_key", string>> = {
  identity_file: IDENTITY_FILE,
  agent_socket: AGENT_SOCKET
}): Promise<MemorySecretStore> {
  const store = new MemorySecretStore();
  for (const [field, value] of Object.entries(fields)) {
    if (value) {
      await store.writeSecret({
        profileId: "github:ssh",
        field,
        value,
        metadata: { provider: "github" }
      });
    }
  }
  return store;
}

function makeConfig(environment = "development"): TokenValveConfig {
  return {
    workspaces: [
      {
        path: WORKSPACE,
        providers: {
          github: {
            profile: "github:ssh",
            environment
          }
        }
      }
    ],
    profiles: [
      { id: "github:ssh", provider: "github", environment, status: "verified" }
    ]
  };
}

function makeAdapters(allowedHosts = ["github.com"]): AdapterDefinition[] {
  return [{
    provider: "github",
    capabilities: [
      {
        id: "github-ssh",
        type: "ssh-command",
        allowedHosts,
        operations: ["connect"]
      },
      {
        id: "github-git-ssh",
        type: "git-ssh",
        allowedHosts,
        operations: ["fetch", "push"]
      }
    ],
    riskRules: [
      { capability: "github-ssh", operation: "connect", risk: "read" },
      { capability: "github-git-ssh", operation: "fetch", risk: "read" },
      { capability: "github-git-ssh", operation: "push", risk: "write" }
    ]
  }];
}

describe("runSshCommand", () => {
  it("runs allowlisted SSH with identity file and agent socket scoped to the child process", async () => {
    const runner = new FakeProcessRunner();
    const before = process.env.SSH_AUTH_SOCK;
    const result = await runSshCommand({
      workspace: WORKSPACE,
      config: makeConfig(),
      adapters: makeAdapters(),
      secretStore: await makeStore(),
      provider: "github",
      host: "github.com",
      user: "git",
      operation: "connect",
      knownHosts: { mode: "strict", file: "/Users/xing/.ssh/known_hosts" },
      runner
    });

    expect(result).toMatchObject({
      executed: true,
      exitCode: 0,
      resolve: {
        decision: "allow",
        profile: "github:ssh",
        capability: "github-ssh",
        risk: "read"
      }
    });
    expect(runner.calls[0]).toMatchObject({
      command: "ssh",
      env: { SSH_AUTH_SOCK: AGENT_SOCKET }
    });
    expect(runner.calls[0]?.args).toContain("-i");
    expect(runner.calls[0]?.args).toContain(IDENTITY_FILE);
    expect(process.env.SSH_AUTH_SOCK).toBe(before);
    expect(result.stdout).not.toContain(IDENTITY_FILE);
    expect(result.stdout).not.toContain(AGENT_SOCKET);
    expect(JSON.stringify(result.audit)).not.toContain(IDENTITY_FILE);
    expect(JSON.stringify(result.audit)).not.toContain(AGENT_SOCKET);
  });

  it("blocks unknown hosts and missing known_hosts policy without launching ssh", async () => {
    const runner = new FakeProcessRunner();
    const unknownHost = await runSshCommand({
      workspace: WORKSPACE,
      config: makeConfig(),
      adapters: makeAdapters(["github.com"]),
      secretStore: await makeStore(),
      provider: "github",
      host: "unknown.example.com",
      operation: "connect",
      knownHosts: { mode: "accept-new" },
      runner
    });
    const missingPolicy = await runSshCommand({
      workspace: WORKSPACE,
      config: makeConfig(),
      adapters: makeAdapters(),
      secretStore: await makeStore(),
      provider: "github",
      host: "github.com",
      operation: "connect",
      runner
    });

    expect(unknownHost.executed).toBe(false);
    expect(unknownHost.resolve.reason).toBe("capability_not_configured");
    expect(missingPolicy.executed).toBe(false);
    expect(missingPolicy.resolve.reason).toBe("capability_not_configured");
    expect(runner.calls).toEqual([]);
  });
});

describe("runGitSsh", () => {
  it("runs git over SSH with GIT_SSH_COMMAND and redacts remote output", async () => {
    const runner = new FakeProcessRunner();
    const result = await runGitSsh({
      workspace: WORKSPACE,
      config: makeConfig(),
      adapters: makeAdapters(),
      secretStore: await makeStore(),
      provider: "github",
      remoteUrl: "git@github.com:ThindoLab/token-valve.git",
      operation: "fetch",
      knownHosts: { mode: "strict", file: "/Users/xing/.ssh/known_hosts" },
      runner
    });

    expect(result).toMatchObject({
      executed: true,
      resolve: {
        decision: "allow",
        profile: "github:ssh",
        capability: "github-git-ssh",
        risk: "read"
      }
    });
    expect(runner.calls[0]?.command).toBe("git");
    expect(runner.calls[0]?.args).toEqual(["fetch", "git@github.com:ThindoLab/token-valve.git"]);
    expect(runner.calls[0]?.env.GIT_SSH_COMMAND).toContain("-i");
    expect(runner.calls[0]?.env.GIT_SSH_COMMAND).toContain(IDENTITY_FILE);
    expect(result.stdout).not.toContain("ThindoLab/private.git");
    expect(JSON.stringify(result.audit)).not.toContain("ThindoLab/token-valve.git");
  });

  it("blocks production write operations pending human intent", async () => {
    const runner = new FakeProcessRunner();
    const result = await runGitSsh({
      workspace: WORKSPACE,
      config: makeConfig("production"),
      adapters: makeAdapters(),
      secretStore: await makeStore(),
      provider: "github",
      remoteUrl: "git@github.com:ThindoLab/token-valve.git",
      operation: "push",
      knownHosts: { mode: "strict", file: "/Users/xing/.ssh/known_hosts" },
      runner
    });

    expect(result.executed).toBe(false);
    expect(result.resolve.reason).toBe("human_intent_required");
    expect(runner.calls).toEqual([]);
  });

  it("supports temporary private key files and cleans the path from output", async () => {
    const runner = new FakeProcessRunner();
    const result = await runGitSsh({
      workspace: WORKSPACE,
      config: makeConfig(),
      adapters: makeAdapters(),
      secretStore: await makeStore({ private_key: PRIVATE_KEY }),
      provider: "github",
      remoteUrl: "git@github.com:ThindoLab/token-valve.git",
      operation: "fetch",
      knownHosts: { mode: "accept-new" },
      runner
    });

    expect(result.executed).toBe(true);
    expect(runner.calls[0]?.env.GIT_SSH_COMMAND).toMatch(/tokenvalve-ssh-/);
    expect(result.stdout).not.toContain(PRIVATE_KEY);
  });
});
