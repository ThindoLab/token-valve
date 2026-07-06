import { describe, expect, it } from "vitest";
import { getDashboardStatus, renderDashboard, renderDashboardHtml, renderDashboardUseResult, startDashboardWebServer, type DashboardSnapshot } from "./index.js";

function sampleSnapshot(): DashboardSnapshot {
  return {
    workspace: "/workspaces/token-valve",
    bindings: [{
      path: "/workspaces/token-valve",
      providers: {
        github: { profile: "github:work", environment: "development" }
      }
    }],
    profiles: [
      {
        id: "github:work",
        provider: "github",
        environment: "development",
        status: "verified",
        maskedFingerprint: "sha256:abcd...1234",
        secretLength: 40
      },
      {
        id: "openai:work",
        provider: "openai",
        status: "expired",
        llm: { defaultModel: "gpt-5" }
      }
    ],
    intents: [{
      id: "intent_1",
      status: "active",
      source: "cli",
      scope: {
        workspace: "/workspaces/token-valve",
        provider: "github",
        profile: "github:work",
        environment: "production",
        risk: "write"
      },
      createdAt: "2026-07-06T00:00:00.000Z",
      expiresAt: "2026-07-06T00:10:00.000Z"
    }],
    recipes: [{
      id: "github-github-work-cli",
      status: "verified",
      binding: {
        workspace: "/workspaces/token-valve",
        provider: "github",
        profile: "github:work",
        capability: "github-cli"
      },
      riskRules: [],
      validationSteps: [],
      createdAt: "2026-07-06T00:00:00.000Z",
      updatedAt: "2026-07-06T00:00:00.000Z"
    }],
    customProviders: [{
      provider: "internal-api",
      capabilities: [{
        id: "internal-status",
        type: "http-request",
        allowedHosts: ["internal.example.test"],
        riskRules: [{ capability: "internal-status", risk: "read" }],
        headers: { Authorization: "Bearer {{token}}" }
      }]
    }],
    doctor: {
      status: "ok",
      message: "project skeleton is runnable"
    },
    audits: {
      available: true,
      summary: ["allowed github ghp_should_not_render_1234567890"]
    }
  };
}

describe("dashboard package", () => {
  it("renders a redacted dashboard snapshot", () => {
    const output = renderDashboard(sampleSnapshot());

    expect(getDashboardStatus()).toBe("dashboard renderer ready");
    expect(output).toContain("TokenValve dashboard");
    expect(output).toContain("github -> github:work");
    expect(output).toContain("status=expired");
    expect(output).toContain("intent_1");
    expect(output).toContain("internal-status");
    expect(output).not.toContain("secretLength");
    expect(output).not.toContain("ghp_should_not_render");
  });

  it("renders a safe profile switch confirmation", () => {
    const output = renderDashboardUseResult({
      workspace: "/workspaces/token-valve",
      provider: "github",
      profile: "github:client",
      environment: "development"
    });

    expect(output).toContain("global auth state: unchanged");
    expect(output).not.toContain("copy secret");
  });

  it("renders the local web UI in Chinese without secrets", () => {
    const output = renderDashboardHtml(sampleSnapshot());

    expect(output).toContain("TokenValve 密钥管理器");
    expect(output).toContain("Workspace Bindings");
    expect(output).toContain("Profiles");
    expect(output).toContain("Custom Providers");
    expect(output).not.toContain("ghp_should_not_render");
    expect(output).not.toContain("secretLength");
  });

  it("serves HTML, JSON snapshot, and safe profile switching", async () => {
    const switches: Array<{ workspace: string; provider: string; profile: string }> = [];
    const web = await startDashboardWebServer({
      host: "127.0.0.1",
      port: 0,
      loadSnapshot: sampleSnapshot,
      switchDefaultProfile: (input) => {
        switches.push(input);
        return { profile: input.profile, environment: "development" };
      }
    });

    try {
      const html = await fetch(web.url).then((response) => response.text());
      const json = await fetch(`${web.url}/api/snapshot`).then((response) => response.json()) as DashboardSnapshot;
      const post = await fetch(`${web.url}/api/default-profile`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          workspace: "/workspaces/token-valve",
          provider: "github",
          profile: "github:client"
        })
      }).then((response) => response.json()) as { ok: boolean };

      expect(html).toContain("TokenValve 密钥管理器");
      expect(JSON.stringify(json)).not.toContain("ghp_should_not_render");
      expect(post.ok).toBe(true);
      expect(switches).toEqual([{ workspace: "/workspaces/token-valve", provider: "github", profile: "github:client" }]);
    } finally {
      await web.close();
    }
  });
});
