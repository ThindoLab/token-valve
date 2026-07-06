import { describe, expect, it } from "vitest";
import { getDashboardStatus, renderDashboard, renderDashboardUseResult } from "./index.js";

describe("dashboard package", () => {
  it("renders a redacted dashboard snapshot", () => {
    const output = renderDashboard({
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
    });

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
});
