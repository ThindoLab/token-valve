import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveContext } from "./resolver.js";

const fixtureConfig = path.join(import.meta.dirname, "fixtures", "resolution-config.yaml");
const fixtureAdapters = path.join(import.meta.dirname, "fixtures", "resolution-adapters.yaml");

describe("resolveContext", () => {
  it("allows a configured GitHub read command", () => {
    const result = resolveContext({
      workspace: "/workspaces/token-valve",
      config: fixtureConfig,
      adapters: fixtureAdapters,
      execution: {
        kind: "cli",
        command: "gh",
        args: ["repo", "view"]
      }
    });

    expect(result).toMatchObject({
      decision: "allow",
      reason: "allowed",
      provider: "github",
      profile: "github:thindolab",
      environment: "development",
      capability: "github-cli",
      risk: "read"
    });
  });

  it("allows a configured Supabase staging write command", () => {
    const result = resolveContext({
      workspace: "/workspaces/token-valve",
      config: fixtureConfig,
      adapters: fixtureAdapters,
      execution: {
        kind: "cli",
        command: "supabase",
        args: ["db", "push"]
      }
    });

    expect(result).toMatchObject({
      decision: "allow",
      provider: "supabase",
      profile: "supabase:thindo:staging",
      environment: "staging",
      capability: "supabase-cli",
      risk: "write"
    });
  });

  it("blocks automatic write operations for unverified profiles", () => {
    const result = resolveContext({
      workspace: "/workspaces/token-valve",
      config: {
        workspaces: [
          {
            path: "/workspaces/token-valve",
            providers: {
              supabase: {
                profile: "supabase:unverified",
                environment: "staging"
              }
            }
          }
        ],
        profiles: [
          {
            id: "supabase:unverified",
            provider: "supabase",
            environment: "staging",
            status: "unverified"
          }
        ]
      },
      adapters: fixtureAdapters,
      execution: {
        kind: "cli",
        command: "supabase",
        args: ["db", "push"]
      }
    });

    expect(result).toMatchObject({
      decision: "blocked",
      reason: "profile_not_verified",
      profile: "supabase:unverified",
      risk: "write"
    });
  });

  it("blocks a configured dangerous GitHub command until human intent exists", () => {
    const result = resolveContext({
      workspace: "/workspaces/token-valve",
      config: fixtureConfig,
      adapters: fixtureAdapters,
      execution: {
        kind: "cli",
        command: "gh",
        args: ["repo", "delete"]
      }
    });

    expect(result).toMatchObject({
      decision: "blocked",
      reason: "human_intent_required",
      provider: "github",
      risk: "dangerous"
    });
  });

  it("blocks a Vercel production deploy without human intent", () => {
    const result = resolveContext({
      workspace: "/workspaces/token-valve",
      config: fixtureConfig,
      adapters: fixtureAdapters,
      execution: {
        kind: "cli",
        command: "vercel",
        args: ["deploy", "--prod"]
      }
    });

    expect(result).toMatchObject({
      decision: "blocked",
      reason: "human_intent_required",
      provider: "vercel",
      environment: "production",
      risk: "production_deploy"
    });
  });

  it("resolves LLM key profile metadata without returning secrets", () => {
    const result = resolveContext({
      workspace: "/workspaces/token-valve",
      config: fixtureConfig,
      adapters: fixtureAdapters,
      execution: {
        kind: "llm",
        provider: "openai",
        useCase: "code-generation"
      }
    });

    expect(result).toMatchObject({
      decision: "allow",
      provider: "openai",
      profile: "openai:work",
      capability: "openai-default",
      risk: "read"
    });
    expect(JSON.stringify(result)).not.toMatch(/apiKey|secretValue|sk-/i);
  });

  it("allows a configured custom provider HTTP read request", () => {
    const result = resolveContext({
      workspace: "/workspaces/token-valve",
      config: fixtureConfig,
      adapters: fixtureAdapters,
      execution: {
        kind: "http",
        method: "GET",
        url: "https://internal.example.test/status/health"
      }
    });

    expect(result).toMatchObject({
      decision: "allow",
      provider: "custom-api",
      profile: "custom-api:internal",
      capability: "internal-status",
      risk: "read"
    });
  });

  it("fails closed for an unknown workspace", () => {
    const result = resolveContext({
      workspace: "/unknown/workspace",
      config: fixtureConfig,
      adapters: fixtureAdapters,
      execution: {
        kind: "cli",
        command: "gh",
        args: ["repo", "view"]
      }
    });

    expect(result).toMatchObject({
      decision: "blocked",
      reason: "workspace_not_configured"
    });
  });

  it("fails closed when no capability matches", () => {
    const result = resolveContext({
      workspace: "/workspaces/token-valve",
      config: fixtureConfig,
      adapters: fixtureAdapters,
      execution: {
        kind: "cli",
        command: "unknown-cli",
        args: ["repo", "view"]
      }
    });

    expect(result).toMatchObject({
      decision: "blocked",
      reason: "provider_not_configured"
    });
  });

  it("fails closed when risk is unknown", () => {
    const result = resolveContext({
      workspace: "/workspaces/token-valve",
      config: fixtureConfig,
      adapters: fixtureAdapters,
      execution: {
        kind: "cli",
        command: "gh",
        args: ["unknown", "subcommand"]
      }
    });

    expect(result).toMatchObject({
      decision: "blocked",
      provider: "github",
      reason: "risk_unknown",
      risk: "unknown"
    });
  });
});
