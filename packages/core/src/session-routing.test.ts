import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveContext } from "./resolver.js";
import type { AgentSessionContext } from "./types.js";

const fixtureConfig = path.join(import.meta.dirname, "fixtures", "resolution-config.yaml");
const fixtureAdapters = path.join(import.meta.dirname, "fixtures", "resolution-adapters.yaml");

const personalSession: AgentSessionContext = {
  id: "session-personal",
  client: "codex",
  providers: {
    github: {
      profile: "github:personal",
      environment: "development"
    }
  }
};

const clientSession: AgentSessionContext = {
  id: "session-client-a",
  client: "claude-code",
  providers: {
    github: {
      profile: "github:client-a",
      environment: "development"
    }
  }
};

function resolveGitHubRepoView(session?: AgentSessionContext) {
  return resolveContext({
    workspace: "/workspaces/token-valve",
    config: fixtureConfig,
    adapters: fixtureAdapters,
    session,
    execution: {
      kind: "cli",
      command: "gh",
      args: ["repo", "view"]
    }
  });
}

describe("agent session routing", () => {
  it("routes two concurrent sessions to different GitHub profiles", async () => {
    const [personal, client] = await Promise.all([
      Promise.resolve(resolveGitHubRepoView(personalSession)),
      Promise.resolve(resolveGitHubRepoView(clientSession))
    ]);

    expect(personal).toMatchObject({
      decision: "allow",
      provider: "github",
      profile: "github:personal",
      session: {
        id: "session-personal",
        client: "codex",
        usedOverride: true
      }
    });
    expect(client).toMatchObject({
      decision: "allow",
      provider: "github",
      profile: "github:client-a",
      session: {
        id: "session-client-a",
        client: "claude-code",
        usedOverride: true
      }
    });
  });

  it("falls back to workspace binding when session is missing", () => {
    expect(resolveGitHubRepoView()).toMatchObject({
      decision: "allow",
      profile: "github:thindolab",
      session: undefined
    });
  });

  it("keeps repeated resolution stable for the same session", () => {
    const results = [
      resolveGitHubRepoView(personalSession),
      resolveGitHubRepoView(personalSession),
      resolveGitHubRepoView(personalSession)
    ];

    expect(results.map((result) => ({
      provider: result.provider,
      profile: result.profile,
      environment: result.environment,
      capability: result.capability,
      risk: result.risk
    }))).toEqual([
      {
        provider: "github",
        profile: "github:personal",
        environment: "development",
        capability: "github-cli",
        risk: "read"
      },
      {
        provider: "github",
        profile: "github:personal",
        environment: "development",
        capability: "github-cli",
        risk: "read"
      },
      {
        provider: "github",
        profile: "github:personal",
        environment: "development",
        capability: "github-cli",
        risk: "read"
      }
    ]);
  });

  it("fails closed when a session override references a missing profile", () => {
    expect(resolveGitHubRepoView({
      id: "session-missing",
      providers: {
        github: {
          profile: "github:missing",
          environment: "development"
        }
      }
    })).toMatchObject({
      decision: "blocked",
      reason: "profile_not_configured",
      session: {
        id: "session-missing",
        usedOverride: true
      }
    });
  });

  it("does not let a session override bypass risk fail-closed behavior", () => {
    const result = resolveContext({
      workspace: "/workspaces/token-valve",
      config: fixtureConfig,
      adapters: fixtureAdapters,
      session: personalSession,
      execution: {
        kind: "cli",
        command: "gh",
        args: ["unknown", "subcommand"]
      }
    });

    expect(result).toMatchObject({
      decision: "blocked",
      provider: "github",
      profile: "github:personal",
      reason: "risk_unknown",
      session: {
        id: "session-personal",
        usedOverride: true
      }
    });
  });
});
