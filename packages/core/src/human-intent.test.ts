import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { HumanIntentStore, findMatchingHumanIntent, parseTtlMs } from "./human-intent.js";
import type { HumanIntentGrant } from "./types.js";

const WORKSPACE = "/workspaces/token-valve";

describe("HumanIntentStore", () => {
  it("creates and revokes TTL-bound local grants without secrets", () => {
    const configDir = mkdtempSync(path.join(tmpdir(), "tokenvalve-intents-"));
    const store = new HumanIntentStore({
      configDir,
      now: () => new Date("2026-07-06T00:00:00.000Z")
    });

    const created = store.create({
      workspace: WORKSPACE,
      provider: "vercel",
      profile: "vercel:team",
      environment: "production",
      risk: "production_deploy",
      ttl: "10m",
      yes: true
    });

    expect(created.intent).toMatchObject({
      status: "active",
      source: "cli",
      scope: {
        workspace: WORKSPACE,
        provider: "vercel",
        profile: "vercel:team",
        environment: "production",
        risk: "production_deploy"
      },
      expiresAt: "2026-07-06T00:10:00.000Z"
    });
    expect(created.audit.intent).toMatchObject({ id: created.intent.id });
    const filePath = path.join(configDir, "intents.yaml");
    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath, "utf8")).not.toMatch(/secretValue|apiKey|privateKey|accessToken/i);

    const revoked = store.revoke({ id: created.intent.id, yes: true });
    expect(revoked.intent.status).toBe("revoked");
    const parsed = parse(readFileSync(filePath, "utf8")) as { intents: HumanIntentGrant[] };
    expect(parsed.intents[0]?.status).toBe("revoked");
  });

  it("marks expired grants when listing", () => {
    const configDir = mkdtempSync(path.join(tmpdir(), "tokenvalve-intents-expired-"));
    const store = new HumanIntentStore({
      configDir,
      now: () => new Date("2026-07-06T00:00:00.000Z")
    });
    store.create({
      workspace: WORKSPACE,
      provider: "github",
      profile: "github:work",
      environment: "production",
      risk: "dangerous",
      ttl: "30s",
      yes: true
    });

    const later = new HumanIntentStore({
      configDir,
      now: () => new Date("2026-07-06T00:01:00.000Z")
    });
    expect(later.list()[0]?.status).toBe("expired");
  });
});

describe("human intent matching", () => {
  it("matches exact scope and ignores expired or mismatched grants", () => {
    const grant: HumanIntentGrant = {
      id: "intent_test",
      status: "active",
      source: "cli",
      scope: {
        workspace: WORKSPACE,
        provider: "vercel",
        profile: "vercel:team",
        environment: "production",
        risk: "production_deploy"
      },
      createdAt: "2026-07-06T00:00:00.000Z",
      expiresAt: "2026-07-06T00:10:00.000Z"
    };

    expect(findMatchingHumanIntent([grant], grant.scope, "2026-07-06T00:05:00.000Z")?.id).toBe("intent_test");
    expect(findMatchingHumanIntent([grant], grant.scope, "2026-07-06T00:11:00.000Z")).toBeUndefined();
    expect(findMatchingHumanIntent([grant], {
      ...grant.scope,
      profile: "vercel:other"
    }, "2026-07-06T00:05:00.000Z")).toBeUndefined();
  });

  it("parses TTL values", () => {
    expect(parseTtlMs("30s")).toBe(30_000);
    expect(parseTtlMs("10m")).toBe(600_000);
    expect(parseTtlMs("2h")).toBe(7_200_000);
    expect(() => parseTtlMs("forever")).toThrow(/Unsupported TTL/);
  });
});
