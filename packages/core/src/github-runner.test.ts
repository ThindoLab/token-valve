import { describe, expect, it } from "vitest";
import { runGitHubCli, type ProcessRunInput, type ProcessRunner } from "./github-runner.js";
import { MemorySecretStore } from "./secret-store.js";
import type { AgentSessionContext, TokenValveConfig } from "./types.js";

const WORKSPACE = "/workspaces/token-valve";
const TOKEN_A = "ghp_personal_token_value_123456";
const TOKEN_B = "ghp_client_token_value_123456";

class FakeProcessRunner implements ProcessRunner {
  public readonly calls: ProcessRunInput[] = [];

  public async run(input: ProcessRunInput) {
    this.calls.push(input);
    const token = input.env.GH_TOKEN ?? "";
    return {
      stdout: `viewer login uses ${token}`,
      stderr: `warning ${token}`,
      exitCode: 0
    };
  }
}

async function makeStore(): Promise<MemorySecretStore> {
  const store = new MemorySecretStore();
  await store.writeSecret({
    profileId: "github:personal",
    field: "token",
    value: TOKEN_A,
    metadata: { provider: "github" }
  });
  await store.writeSecret({
    profileId: "github:client",
    field: "token",
    value: TOKEN_B,
    metadata: { provider: "github" }
  });
  return store;
}

function makeConfig(): TokenValveConfig {
  return {
    workspaces: [
      {
        path: WORKSPACE,
        providers: {
          github: {
            profile: "github:personal",
            environment: "development"
          }
        }
      }
    ],
    profiles: [
      { id: "github:personal", provider: "github", environment: "development", status: "verified" },
      { id: "github:client", provider: "github", environment: "development", status: "verified" }
    ]
  };
}

describe("runGitHubCli", () => {
  it("runs allowed read commands with per-process GitHub token env", async () => {
    const runner = new FakeProcessRunner();
    const before = process.env.GH_TOKEN;
    const result = await runGitHubCli({
      workspace: WORKSPACE,
      config: makeConfig(),
      secretStore: await makeStore(),
      args: ["repo", "view"],
      runner
    });

    expect(result).toMatchObject({
      executed: true,
      exitCode: 0,
      resolve: {
        decision: "allow",
        provider: "github",
        profile: "github:personal",
        risk: "read"
      }
    });
    expect(runner.calls[0]).toMatchObject({
      command: "gh",
      args: ["repo", "view"],
      env: {
        GH_TOKEN: TOKEN_A,
        GITHUB_TOKEN: TOKEN_A
      }
    });
    expect(process.env.GH_TOKEN).toBe(before);
    expect(result.stdout).not.toContain(TOKEN_A);
    expect(result.stderr).not.toContain(TOKEN_A);
    expect(JSON.stringify(result.audit)).not.toContain(TOKEN_A);
  });

  it("routes concurrent sessions to different GitHub tokens without global state", async () => {
    const runner = new FakeProcessRunner();
    const store = await makeStore();
    const personalSession: AgentSessionContext = {
      id: "session-personal",
      client: "codex",
      providers: {
        github: { profile: "github:personal", environment: "development" }
      }
    };
    const clientSession: AgentSessionContext = {
      id: "session-client",
      client: "claude-code",
      providers: {
        github: { profile: "github:client", environment: "development" }
      }
    };

    const [personal, client] = await Promise.all([
      runGitHubCli({
        workspace: WORKSPACE,
        config: makeConfig(),
        secretStore: store,
        args: ["api", "user"],
        session: personalSession,
        runner
      }),
      runGitHubCli({
        workspace: WORKSPACE,
        config: makeConfig(),
        secretStore: store,
        args: ["repo", "list"],
        session: clientSession,
        runner
      })
    ]);

    expect(personal.resolve.profile).toBe("github:personal");
    expect(client.resolve.profile).toBe("github:client");
    expect(runner.calls.map((call) => call.env.GH_TOKEN).sort()).toEqual([TOKEN_A, TOKEN_B].sort());
  });

  it("blocks unsupported or dangerous commands without launching gh", async () => {
    const runner = new FakeProcessRunner();
    const deleteResult = await runGitHubCli({
      workspace: WORKSPACE,
      config: makeConfig(),
      secretStore: await makeStore(),
      args: ["repo", "delete"],
      runner
    });
    const authResult = await runGitHubCli({
      workspace: WORKSPACE,
      config: makeConfig(),
      secretStore: await makeStore(),
      args: ["auth", "switch"],
      runner
    });

    expect(deleteResult.executed).toBe(false);
    expect(deleteResult.resolve.reason).toBe("human_intent_required");
    expect(authResult.executed).toBe(false);
    expect(runner.calls).toEqual([]);
  });

  it("blocks when the GitHub token is missing", async () => {
    const runner = new FakeProcessRunner();
    const result = await runGitHubCli({
      workspace: WORKSPACE,
      config: makeConfig(),
      secretStore: new MemorySecretStore(),
      args: ["repo", "view"],
      runner
    });

    expect(result).toMatchObject({
      executed: false,
      exitCode: 1,
      resolve: {
        decision: "blocked",
        reason: "profile_not_configured",
        profile: "github:personal"
      }
    });
    expect(result.stderr).toContain("token is missing");
    expect(runner.calls).toEqual([]);
  });
});
