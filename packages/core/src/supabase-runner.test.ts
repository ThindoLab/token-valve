import { describe, expect, it } from "vitest";
import { type ProcessRunInput, type ProcessRunner } from "./github-runner.js";
import {
  runSupabaseApi,
  runSupabaseCli,
  type HttpRunInput,
  type HttpRunner
} from "./supabase-runner.js";
import { MemorySecretStore } from "./secret-store.js";
import type { TokenValveConfig } from "./types.js";

const WORKSPACE = "/workspaces/token-valve";
const TOKEN = "sbp_staging_token_value_123456";
const PROD_TOKEN = "sbp_production_token_value_123456";

class FakeProcessRunner implements ProcessRunner {
  public readonly calls: ProcessRunInput[] = [];

  public async run(input: ProcessRunInput) {
    this.calls.push(input);
    return {
      stdout: `projects ${input.env.SUPABASE_ACCESS_TOKEN}`,
      stderr: `warning ${input.env.SUPABASE_ACCESS_TOKEN}`,
      exitCode: 0
    };
  }
}

class FakeHttpRunner implements HttpRunner {
  public readonly calls: HttpRunInput[] = [];

  public async run(input: HttpRunInput) {
    this.calls.push(input);
    return {
      status: 200,
      body: `{"token":"${input.headers.Authorization}"}`
    };
  }
}

async function makeStore(): Promise<MemorySecretStore> {
  const store = new MemorySecretStore();
  await store.writeSecret({
    profileId: "supabase:staging",
    field: "token",
    value: TOKEN,
    metadata: { provider: "supabase", environment: "staging" }
  });
  await store.writeSecret({
    profileId: "supabase:production",
    field: "token",
    value: PROD_TOKEN,
    metadata: { provider: "supabase", environment: "production" }
  });
  return store;
}

function makeConfig(profile = "supabase:staging", environment = "staging"): TokenValveConfig {
  return {
    workspaces: [
      {
        path: WORKSPACE,
        providers: {
          supabase: {
            profile,
            environment
          }
        }
      }
    ],
    profiles: [
      { id: "supabase:staging", provider: "supabase", environment: "staging", status: "verified" },
      { id: "supabase:production", provider: "supabase", environment: "production", status: "verified" }
    ]
  };
}

describe("runSupabaseCli", () => {
  it("runs staging read commands with per-process Supabase token env", async () => {
    const runner = new FakeProcessRunner();
    const result = await runSupabaseCli({
      workspace: WORKSPACE,
      config: makeConfig(),
      secretStore: await makeStore(),
      args: ["projects", "list"],
      runner
    });

    expect(result).toMatchObject({
      executed: true,
      exitCode: 0,
      resolve: {
        decision: "allow",
        provider: "supabase",
        profile: "supabase:staging",
        environment: "staging",
        risk: "read"
      }
    });
    expect(runner.calls[0]).toMatchObject({
      command: "supabase",
      args: ["projects", "list"],
      env: {
        SUPABASE_ACCESS_TOKEN: TOKEN
      }
    });
    expect(result.stdout).not.toContain(TOKEN);
    expect(result.stderr).not.toContain(TOKEN);
    expect(JSON.stringify(result.audit)).not.toContain(TOKEN);
  });

  it("blocks production writes and dangerous commands without launching supabase", async () => {
    const runner = new FakeProcessRunner();
    const store = await makeStore();
    const productionWrite = await runSupabaseCli({
      workspace: WORKSPACE,
      config: makeConfig("supabase:production", "production"),
      secretStore: store,
      args: ["db", "--linked", "push"],
      runner
    });
    const reset = await runSupabaseCli({
      workspace: WORKSPACE,
      config: makeConfig(),
      secretStore: store,
      args: ["db", "reset"],
      runner
    });
    const secretsSet = await runSupabaseCli({
      workspace: WORKSPACE,
      config: makeConfig(),
      secretStore: store,
      args: ["secrets", "set", "API_KEY=value"],
      runner
    });
    const login = await runSupabaseCli({
      workspace: WORKSPACE,
      config: makeConfig(),
      secretStore: store,
      args: ["login"],
      runner
    });

    expect(productionWrite).toMatchObject({
      executed: false,
      resolve: {
        reason: "human_intent_required",
        risk: "write",
        environment: "production"
      }
    });
    expect(reset.executed).toBe(false);
    expect(reset.resolve.reason).toBe("human_intent_required");
    expect(secretsSet.executed).toBe(false);
    expect(login.executed).toBe(false);
    expect(runner.calls).toEqual([]);
  });

  it("runs production writes when active human intent matches", async () => {
    const runner = new FakeProcessRunner();
    const result = await runSupabaseCli({
      workspace: WORKSPACE,
      config: makeConfig("supabase:production", "production"),
      secretStore: await makeStore(),
      args: ["db", "push"],
      now: "2026-07-06T00:05:00.000Z",
      activeIntents: [{
        id: "intent_supabase_prod_write",
        status: "active",
        source: "cli",
        scope: {
          workspace: WORKSPACE,
          provider: "supabase",
          profile: "supabase:production",
          environment: "production",
          risk: "write"
        },
        createdAt: "2026-07-06T00:00:00.000Z",
        expiresAt: "2026-07-06T00:10:00.000Z"
      }],
      runner
    });

    expect(result).toMatchObject({
      executed: true,
      resolve: {
        decision: "allow",
        environment: "production",
        risk: "write",
        intent: {
          id: "intent_supabase_prod_write"
        }
      }
    });
    expect(runner.calls[0]).toMatchObject({
      command: "supabase",
      args: ["db", "push"],
      env: {
        SUPABASE_ACCESS_TOKEN: PROD_TOKEN
      }
    });
    expect(result.stdout).not.toContain(PROD_TOKEN);
  });

  it("blocks when the Supabase token is missing", async () => {
    const runner = new FakeProcessRunner();
    const result = await runSupabaseCli({
      workspace: WORKSPACE,
      config: makeConfig(),
      secretStore: new MemorySecretStore(),
      args: ["projects", "list"],
      runner
    });

    expect(result).toMatchObject({
      executed: false,
      resolve: {
        decision: "blocked",
        reason: "profile_not_configured",
        profile: "supabase:staging"
      }
    });
    expect(runner.calls).toEqual([]);
  });
});

describe("runSupabaseApi", () => {
  it("runs allowlisted Management API GET requests with Authorization injection", async () => {
    const runner = new FakeHttpRunner();
    const result = await runSupabaseApi({
      workspace: WORKSPACE,
      config: makeConfig(),
      secretStore: await makeStore(),
      method: "GET",
      url: "https://api.supabase.com/v1/projects",
      runner
    });

    expect(result).toMatchObject({
      executed: true,
      status: 200,
      resolve: {
        decision: "allow",
        provider: "supabase",
        profile: "supabase:staging",
        risk: "read"
      }
    });
    expect(runner.calls[0]).toMatchObject({
      method: "GET",
      url: "https://api.supabase.com/v1/projects",
      headers: {
        Authorization: `Bearer ${TOKEN}`
      }
    });
    expect(result.body).not.toContain(TOKEN);
    expect(JSON.stringify(result.audit)).not.toContain(TOKEN);
    expect(result.audit.request).toMatchObject({
      method: "GET",
      host: "api.supabase.com",
      path: "/v1/projects"
    });
  });
});
