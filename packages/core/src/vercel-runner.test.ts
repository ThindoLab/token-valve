import { describe, expect, it } from "vitest";
import { type ProcessRunInput, type ProcessRunner } from "./github-runner.js";
import { MemorySecretStore } from "./secret-store.js";
import { runVercelCli } from "./vercel-runner.js";
import type { TokenValveConfig } from "./types.js";

const WORKSPACE = "/workspaces/token-valve";
const TOKEN = "vercel_token_value_123456789";
const ORG_ID = "team_thindo";
const PROJECT_ID = "prj_tokenvalve";

class FakeProcessRunner implements ProcessRunner {
  public readonly calls: ProcessRunInput[] = [];

  public async run(input: ProcessRunInput) {
    this.calls.push(input);
    return {
      stdout: `deployed with ${input.env.VERCEL_TOKEN} ${input.env.VERCEL_ORG_ID ?? ""} ${input.env.VERCEL_PROJECT_ID ?? ""}`,
      stderr: "",
      exitCode: 0
    };
  }
}

async function makeStore(includeToken = true): Promise<MemorySecretStore> {
  const store = new MemorySecretStore();
  if (includeToken) {
    await store.writeSecret({
      profileId: "vercel:team",
      field: "token",
      value: TOKEN,
      metadata: { provider: "vercel" }
    });
  }
  await store.writeSecret({
    profileId: "vercel:team",
    field: "org_id",
    value: ORG_ID,
    metadata: { provider: "vercel" }
  });
  await store.writeSecret({
    profileId: "vercel:team",
    field: "project_id",
    value: PROJECT_ID,
    metadata: { provider: "vercel" }
  });
  return store;
}

function makeConfig(status: "verified" | "unverified" = "verified"): TokenValveConfig {
  return {
    workspaces: [
      {
        path: WORKSPACE,
        providers: {
          vercel: {
            profile: "vercel:team",
            environment: "preview"
          }
        }
      }
    ],
    profiles: [
      { id: "vercel:team", provider: "vercel", environment: "preview", status }
    ]
  };
}

describe("runVercelCli", () => {
  it("runs preview deploy with per-process Vercel env and redacted output", async () => {
    const runner = new FakeProcessRunner();
    const result = await runVercelCli({
      workspace: WORKSPACE,
      config: makeConfig(),
      secretStore: await makeStore(),
      args: ["deploy"],
      runner
    });

    expect(result).toMatchObject({
      executed: true,
      exitCode: 0,
      resolve: {
        decision: "allow",
        provider: "vercel",
        profile: "vercel:team",
        risk: "write"
      }
    });
    expect(runner.calls[0]).toMatchObject({
      command: "vercel",
      args: ["deploy"],
      env: {
        VERCEL_TOKEN: TOKEN,
        VERCEL_ORG_ID: ORG_ID,
        VERCEL_PROJECT_ID: PROJECT_ID
      }
    });
    expect(result.stdout).not.toContain(TOKEN);
    expect(JSON.stringify(result.audit)).not.toContain(TOKEN);
  });

  it("blocks production deploys pending human intent", async () => {
    const runner = new FakeProcessRunner();
    const result = await runVercelCli({
      workspace: WORKSPACE,
      config: makeConfig(),
      secretStore: await makeStore(),
      args: ["deploy", "--prod"],
      runner
    });

    expect(result.executed).toBe(false);
    expect(result.resolve.reason).toBe("human_intent_required");
    expect(runner.calls).toEqual([]);
  });

  it("blocks global auth commands and missing tokens without launching vercel", async () => {
    const runner = new FakeProcessRunner();
    const login = await runVercelCli({
      workspace: WORKSPACE,
      config: makeConfig(),
      secretStore: await makeStore(),
      args: ["login"],
      runner
    });
    const missingToken = await runVercelCli({
      workspace: WORKSPACE,
      config: makeConfig(),
      secretStore: await makeStore(false),
      args: ["deploy"],
      runner
    });

    expect(login.executed).toBe(false);
    expect(login.resolve.reason).toBe("capability_not_configured");
    expect(missingToken.executed).toBe(false);
    expect(missingToken.resolve.reason).toBe("profile_not_configured");
    expect(runner.calls).toEqual([]);
  });

  it("blocks preview deploy when profile is not verified", async () => {
    const runner = new FakeProcessRunner();
    const result = await runVercelCli({
      workspace: WORKSPACE,
      config: makeConfig("unverified"),
      secretStore: await makeStore(),
      args: ["deploy"],
      runner
    });

    expect(result.executed).toBe(false);
    expect(result.resolve.reason).toBe("profile_not_verified");
    expect(runner.calls).toEqual([]);
  });
});
