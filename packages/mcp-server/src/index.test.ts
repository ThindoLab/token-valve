import { describe, expect, it } from "vitest";
import {
  MemorySecretStore,
  type AdapterDefinition,
  type ProcessRunInput,
  type ProcessRunner,
  type TokenValveConfig
} from "@tokenvalve/core";
import { MCP_TOOL_NAMES, TokenValveMcpServer, getMcpServerStatus } from "./index.js";

const WORKSPACE = "/workspaces/token-valve";
const GITHUB_TOKEN = "ghp_mcp_secret_value_1234567890";

class FakeProcessRunner implements ProcessRunner {
  public readonly calls: ProcessRunInput[] = [];

  public async run(input: ProcessRunInput) {
    this.calls.push(input);
    const token = input.env.GH_TOKEN ?? input.env.GITHUB_TOKEN ?? "";
    return {
      stdout: `ok ${token}`,
      stderr: `warning ${token}`,
      exitCode: 0
    };
  }
}

function makeConfig(): TokenValveConfig {
  return {
    workspaces: [{
      path: WORKSPACE,
      providers: {
        github: {
          profile: "github:work",
          environment: "development"
        },
        vercel: {
          profile: "vercel:prod",
          environment: "production"
        }
      }
    }],
    profiles: [
      {
        id: "github:work",
        provider: "github",
        environment: "development",
        status: "verified",
        maskedFingerprint: "sha256:abc123",
        secretLength: 40
      },
      {
        id: "github:client",
        provider: "github",
        environment: "development",
        status: "verified"
      },
      {
        id: "vercel:prod",
        provider: "vercel",
        environment: "production",
        status: "verified"
      }
    ]
  };
}

function makeAdapters(): AdapterDefinition[] {
  return [
    {
      provider: "github",
      capabilities: [{ id: "github-cli", type: "cli-command", commands: ["gh"] }],
      riskRules: [
        { capability: "github-cli", match: ["repo", "view"], risk: "read" }
      ]
    },
    {
      provider: "vercel",
      capabilities: [{ id: "vercel-cli", type: "cli-command", commands: ["vercel"] }],
      riskRules: [
        { capability: "vercel-cli", match: ["deploy"], risk: "write" },
        { capability: "vercel-cli", match: ["deploy", "--prod"], risk: "production_deploy" }
      ]
    },
    {
      provider: "openai",
      capabilities: [{ id: "openai-default", type: "llm-api-key", provider: "openai", useCases: ["code-generation"] }],
      riskRules: [{ capability: "openai-default", useCase: "code-generation", risk: "read" }]
    }
  ];
}

async function makeStore(): Promise<MemorySecretStore> {
  const store = new MemorySecretStore();
  await store.writeSecret({
    profileId: "github:work",
    field: "token",
    value: GITHUB_TOKEN,
    metadata: { provider: "github" }
  });
  return store;
}

describe("TokenValveMcpServer", () => {
  it("exposes the MCP server status", () => {
    expect(getMcpServerStatus()).toBe("mcp server tools ready");
  });

  it("lists all roadmap MCP tools", () => {
    const server = new TokenValveMcpServer();
    const tools = server.listTools();

    expect(tools.map((tool) => tool.name)).toEqual([...MCP_TOOL_NAMES]);
    expect(tools).toHaveLength(14);
    expect(tools.every((tool) => tool.description && tool.inputSchema.type === "object")).toBe(true);
  });

  it("returns profile metadata without secret values", async () => {
    const server = new TokenValveMcpServer({
      config: makeConfig(),
      adapters: makeAdapters(),
      secretStore: await makeStore()
    });
    const result = await server.callTool("profiles_list");

    expect(result.ok).toBe(true);
    expect(JSON.stringify(result.data)).toContain("github:work");
    expect(JSON.stringify(result.data)).not.toContain(GITHUB_TOKEN);
    expect(JSON.stringify(result.data)).not.toContain("secretLength");
  });

  it("rejects shell strings for execution tools without launching a runner", async () => {
    const runner = new FakeProcessRunner();
    const server = new TokenValveMcpServer({
      config: makeConfig(),
      adapters: makeAdapters(),
      secretStore: await makeStore(),
      processRunner: runner
    });
    const result = await server.callTool("exec_with_secrets", {
      workspace: WORKSPACE,
      provider: "github",
      commandLine: "gh repo view"
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "structured_args_required"
      }
    });
    expect(runner.calls).toEqual([]);
  });

  it("executes structured GitHub commands without returning raw secrets", async () => {
    const runner = new FakeProcessRunner();
    const server = new TokenValveMcpServer({
      config: makeConfig(),
      adapters: makeAdapters(),
      secretStore: await makeStore(),
      processRunner: runner
    });
    const result = await server.callTool("exec_with_secrets", {
      workspace: WORKSPACE,
      provider: "github",
      args: ["repo", "view"]
    });

    expect(result.ok).toBe(true);
    expect(runner.calls[0]).toMatchObject({
      command: "gh",
      args: ["repo", "view"],
      env: {
        GH_TOKEN: GITHUB_TOKEN
      }
    });
    expect(JSON.stringify(result)).not.toContain(GITHUB_TOKEN);
  });

  it("creates pending intent requests without activating production permission", async () => {
    const server = new TokenValveMcpServer({
      config: makeConfig(),
      adapters: makeAdapters()
    });

    const intent = await server.callTool("intent_request", {
      workspace: WORKSPACE,
      provider: "vercel",
      profile: "vercel:prod",
      environment: "production",
      risk: "production_deploy"
    });
    const resolved = await server.callTool("context_resolve", {
      workspace: WORKSPACE,
      execution: {
        kind: "cli",
        command: "vercel",
        args: ["deploy", "--prod"]
      }
    });

    expect(intent.ok).toBe(true);
    expect(JSON.stringify(intent.data)).toContain("pending");
    expect(JSON.stringify(intent.data)).toContain("\"active\":false");
    expect(resolved.ok).toBe(true);
    expect(resolved.data).toMatchObject({
      decision: "blocked",
      reason: "human_intent_required"
    });
  });

  it("resolves concurrent sessions independently", async () => {
    const server = new TokenValveMcpServer({
      config: makeConfig(),
      adapters: makeAdapters()
    });
    const [work, client] = await Promise.all([
      server.callTool("context_resolve", {
        workspace: WORKSPACE,
        session: {
          id: "session-work",
          client: "codex",
          providers: {
            github: { profile: "github:work", environment: "development" }
          }
        },
        execution: {
          kind: "cli",
          command: "gh",
          args: ["repo", "view"]
        }
      }),
      server.callTool("context_resolve", {
        workspace: WORKSPACE,
        session: {
          id: "session-client",
          client: "claude-code",
          providers: {
            github: { profile: "github:client", environment: "development" }
          }
        },
        execution: {
          kind: "cli",
          command: "gh",
          args: ["repo", "view"]
        }
      })
    ]);

    expect(work.data).toMatchObject({
      profile: "github:work",
      session: { usedOverride: true }
    });
    expect(client.data).toMatchObject({
      profile: "github:client",
      session: { usedOverride: true }
    });
  });

  it("rejects secret values in secret_profile_create", async () => {
    const server = new TokenValveMcpServer({ config: makeConfig() });
    const rejected = await server.callTool("secret_profile_create", {
      profile: "github:new",
      provider: "github",
      token: "ghp_should_not_be_here"
    });
    const accepted = await server.callTool("secret_profile_create", {
      profile: "github:new",
      provider: "github",
      environment: "development",
      workspace: WORKSPACE
    });

    expect(rejected).toMatchObject({
      ok: false,
      error: { code: "secret_value_rejected" }
    });
    expect(accepted.ok).toBe(true);
    expect(JSON.stringify(accepted.data)).not.toContain("ghp_should_not_be_here");
  });
});
