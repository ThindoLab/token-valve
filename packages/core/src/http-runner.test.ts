import { describe, expect, it } from "vitest";
import { type ProcessRunInput, type ProcessRunner } from "./github-runner.js";
import {
  runCurlTemplate,
  runHttpRequest,
  type HttpRunInput,
  type HttpRunner
} from "./http-runner.js";
import { MemorySecretStore } from "./secret-store.js";
import type { AdapterDefinition, TokenValveConfig } from "./types.js";

const WORKSPACE = "/workspaces/token-valve";
const TOKEN = "ghp_http_runner_token_value_123456";

class FakeHttpRunner implements HttpRunner {
  public readonly calls: HttpRunInput[] = [];

  public async run(input: HttpRunInput) {
    this.calls.push(input);
    return {
      status: 200,
      body: `ok ${input.headers.Authorization ?? ""} ${input.body ?? ""}`
    };
  }
}

class FakeProcessRunner implements ProcessRunner {
  public readonly calls: ProcessRunInput[] = [];

  public async run(input: ProcessRunInput) {
    this.calls.push(input);
    return {
      stdout: `ok ${input.args.join(" ")}`,
      stderr: "",
      exitCode: 0
    };
  }
}

async function makeStore(): Promise<MemorySecretStore> {
  const store = new MemorySecretStore();
  await store.writeSecret({
    profileId: "github:work",
    field: "token",
    value: TOKEN,
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
            profile: "github:work",
            environment: "development"
          }
        }
      }
    ],
    profiles: [
      { id: "github:work", provider: "github", environment: "development", status: "verified" }
    ]
  };
}

function makeAdapters(includeRisk = true): AdapterDefinition[] {
  return [{
    provider: "github",
    capabilities: [
      {
        id: "github-api",
        type: "http-request",
        allowedHosts: ["api.github.com"],
        pathPrefixes: ["/user"],
        methods: ["GET"]
      },
      {
        id: "github-curl",
        type: "curl-template",
        commands: ["curl"],
        allowedHosts: ["api.github.com"],
        pathPrefixes: ["/user"],
        methods: ["GET"]
      }
    ],
    riskRules: includeRisk
      ? [
          { capability: "github-api", method: "GET", pathPrefix: "/user", risk: "read" },
          { capability: "github-curl", match: ["GET"], risk: "read" }
        ]
      : []
  }];
}

describe("runHttpRequest", () => {
  it("runs allowlisted HTTP requests with secret templates and redacted output", async () => {
    const runner = new FakeHttpRunner();
    const result = await runHttpRequest({
      workspace: WORKSPACE,
      config: makeConfig(),
      adapters: makeAdapters(),
      secretStore: await makeStore(),
      provider: "github",
      method: "GET",
      url: "https://api.github.com/user",
      secretTemplates: {
        headers: { Authorization: "Bearer {{token}}" },
        body: { token: "{{token}}" }
      },
      runner
    });

    expect(result).toMatchObject({
      executed: true,
      status: 200,
      resolve: {
        decision: "allow",
        provider: "github",
        profile: "github:work",
        capability: "github-api",
        risk: "read"
      }
    });
    expect(runner.calls[0]).toMatchObject({
      method: "GET",
      url: "https://api.github.com/user",
      headers: {
        Authorization: `Bearer ${TOKEN}`
      },
      body: JSON.stringify({ token: TOKEN })
    });
    expect(result.body).not.toContain(TOKEN);
    expect(JSON.stringify(result.audit)).not.toContain(TOKEN);
    expect(result.audit.request).toMatchObject({
      method: "GET",
      host: "api.github.com",
      path: "/user"
    });
  });

  it("blocks non-allowlisted hosts and unknown risk without running HTTP", async () => {
    const runner = new FakeHttpRunner();
    const nonAllowlisted = await runHttpRequest({
      workspace: WORKSPACE,
      config: makeConfig(),
      adapters: makeAdapters(),
      secretStore: await makeStore(),
      provider: "github",
      method: "GET",
      url: "https://evil.example.test/user",
      runner
    });
    const unknownRisk = await runHttpRequest({
      workspace: WORKSPACE,
      config: makeConfig(),
      adapters: makeAdapters(false),
      secretStore: await makeStore(),
      provider: "github",
      method: "GET",
      url: "https://api.github.com/user",
      runner
    });

    expect(nonAllowlisted.executed).toBe(false);
    expect(nonAllowlisted.resolve.reason).toBe("capability_not_configured");
    expect(unknownRisk.executed).toBe(false);
    expect(unknownRisk.resolve.reason).toBe("risk_unknown");
    expect(runner.calls).toEqual([]);
  });
});

describe("runCurlTemplate", () => {
  it("runs curl via args array and redacts output", async () => {
    const runner = new FakeProcessRunner();
    const result = await runCurlTemplate({
      workspace: WORKSPACE,
      config: makeConfig(),
      adapters: makeAdapters(),
      secretStore: await makeStore(),
      provider: "github",
      method: "GET",
      url: "https://api.github.com/user",
      secretTemplates: {
        headers: { Authorization: "Bearer {{token}}" }
      },
      runner
    });

    expect(result).toMatchObject({
      executed: true,
      exitCode: 0,
      resolve: {
        decision: "allow",
        capability: "github-curl",
        risk: "read"
      }
    });
    expect(runner.calls[0]?.command).toBe("curl");
    expect(runner.calls[0]?.args).toEqual([
      "--fail-with-body",
      "--silent",
      "--show-error",
      "--request",
      "GET",
      "https://api.github.com/user",
      "--header",
      `Authorization: Bearer ${TOKEN}`
    ]);
    expect(result.stdout).not.toContain(TOKEN);
    expect(JSON.stringify(result.audit)).not.toContain(TOKEN);
  });
});
