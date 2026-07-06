import { describe, expect, it } from "vitest";
import { redactForReturn, redactText } from "./redactor.js";

describe("redactText", () => {
  it("redacts known secrets", () => {
    const result = redactText("token is tv_live_secret_123456", {
      knownSecrets: ["tv_live_secret_123456"]
    });

    expect(result.text).toBe("token is [REDACTED:known-secret]");
    expect(result.text).not.toContain("tv_live_secret_123456");
    expect(result.findings).toContainEqual({
      type: "known-secret",
      replacement: "[REDACTED:known-secret]"
    });
  });

  it("ignores short known secrets to avoid noisy replacements", () => {
    expect(redactText("key abc stays", { knownSecrets: ["abc"] }).text).toBe("key abc stays");
  });

  it("redacts authorization headers and URL query secrets", () => {
    const result = redactText(
      "Authorization: Bearer ghp_abcdefghijklmnopqrstuvwxyz123456 https://api.example.test/v1/projects?access_token=secret-token&safe=value"
    );

    expect(result.text).toContain("Authorization: Bearer [REDACTED:authorization]");
    expect(result.text).toContain("access_token=[REDACTED:url-query]");
    expect(result.text).toContain("safe=value");
    expect(result.text).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz123456");
    expect(result.text).not.toContain("secret-token");
  });

  it("redacts common token-like patterns", () => {
    const result = redactText(
      [
        "openai sk-abcdefghijklmnopqrstuvwxyz123456",
        "anthropic sk-ant-abcdefghijklmnopqrstuvwxyz123456",
        "jwt eyJhbGciOiJIUzI1NiJ9.abcdefghijklmnopqrstuvwxyz.abcdefghijklmnopqrstuvwxyz"
      ].join("\n")
    );

    expect(result.text).toContain("[REDACTED:openai-token]");
    expect(result.text).toContain("[REDACTED:anthropic-token]");
    expect(result.text).toContain("[REDACTED:jwt]");
  });

  it("redacts SSH remotes, agent sockets, and identity files", () => {
    const result = redactText(
      "git@github.com:ThindoLab/token-valve.git SSH_AUTH_SOCK=/private/tmp/com.apple.launchd.xxx/Listeners ssh -i /Users/xing/.ssh/id_ed25519_client host"
    );

    expect(result.text).toContain("git@github.com:[REDACTED:ssh-remote]");
    expect(result.text).toContain("SSH_AUTH_SOCK=[REDACTED:ssh-agent-socket]");
    expect(result.text).toContain("-i [REDACTED:ssh-identity-file]");
    expect(result.text).not.toContain("ThindoLab/token-valve.git");
    expect(result.text).not.toContain("/private/tmp/com.apple.launchd.xxx/Listeners");
    expect(result.text).not.toContain("/Users/xing/.ssh/id_ed25519_client");
  });
});

describe("redactForReturn", () => {
  it("marks long output as truncated and unsafe to return", () => {
    const result = redactForReturn("a".repeat(20), { maxLength: 8 });

    expect(result.text).toBe("aaaaaaaa\n[TRUNCATED:unsafe-output]");
    expect(result.truncated).toBe(true);
    expect(result.safeToReturn).toBe(false);
  });
});
