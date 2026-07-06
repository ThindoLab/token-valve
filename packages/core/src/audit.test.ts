import { describe, expect, it } from "vitest";
import { shapeAuditEvent } from "./audit.js";

describe("shapeAuditEvent", () => {
  it("shapes command audit events without raw secrets", () => {
    const event = shapeAuditEvent({
      timestamp: "2026-07-06T00:00:00.000Z",
      source: "shim",
      provider: "github",
      profile: "github:work",
      capability: "github-cli",
      risk: "read",
      decision: "allow",
      command: {
        binary: "gh",
        args: ["api", "user", "--token", "tv_live_secret_123456"]
      },
      message: "using tv_live_secret_123456",
      knownSecrets: ["tv_live_secret_123456"]
    });

    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain("tv_live_secret_123456");
    expect(event).toMatchObject({
      timestamp: "2026-07-06T00:00:00.000Z",
      source: "shim",
      provider: "github",
      profile: "github:work",
      capability: "github-cli",
      risk: "read",
      decision: "allow",
      command: {
        binary: "gh",
        argsRedacted: ["api", "user", "--token", "[REDACTED:known-secret]"]
      },
      messageRedacted: "using [REDACTED:known-secret]"
    });
  });

  it("shapes HTTP audit events as redacted summaries", () => {
    const event = shapeAuditEvent({
      timestamp: "2026-07-06T00:00:00.000Z",
      source: "http",
      provider: "supabase",
      profile: "supabase:prod",
      capability: "management-api",
      risk: "write",
      decision: "blocked",
      reason: "human_intent_required",
      request: {
        method: "post",
        url: "https://api.supabase.com/v1/projects?access_token=secret-token&safe=value",
        headers: {
          Authorization: "Bearer ghp_abcdefghijklmnopqrstuvwxyz123456"
        },
        body: {
          apiKey: "tv_live_secret_123456"
        }
      },
      knownSecrets: ["tv_live_secret_123456"]
    });

    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain("secret-token");
    expect(serialized).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz123456");
    expect(serialized).not.toContain("tv_live_secret_123456");
    expect(event.request).toMatchObject({
      method: "POST",
      host: "api.supabase.com",
      path: "/v1/projects?access_token=[REDACTED:url-query]&safe=value",
      headersRedacted: {
        Authorization: "Bearer [REDACTED:authorization]"
      },
      bodyRedacted: {
        apiKey: "[REDACTED:known-secret]"
      }
    });
  });

  it("shapes SSH audit events without raw remotes or socket paths", () => {
    const event = shapeAuditEvent({
      timestamp: "2026-07-06T00:00:00.000Z",
      source: "ssh",
      provider: "github",
      profile: "github:client",
      capability: "git-ssh",
      risk: "write",
      decision: "allow",
      operation: {
        type: "git-ssh",
        target: "git@github.com:ThindoLab/token-valve.git",
        command: "ssh -i /Users/xing/.ssh/id_ed25519_client git@github.com",
        metadata: {
          socket: "SSH_AUTH_SOCK=/private/tmp/com.apple.launchd.xxx/Listeners"
        }
      }
    });

    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain("ThindoLab/token-valve.git");
    expect(serialized).not.toContain("/Users/xing/.ssh/id_ed25519_client");
    expect(serialized).not.toContain("/private/tmp/com.apple.launchd.xxx/Listeners");
    expect(event.operation).toMatchObject({
      targetRedacted: "git@github.com:[REDACTED:ssh-remote]",
      commandRedacted: "ssh -i [REDACTED:ssh-identity-file] git@github.com",
      metadataRedacted: {
        socket: "SSH_AUTH_SOCK=[REDACTED:ssh-agent-socket]"
      }
    });
  });
});
