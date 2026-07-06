import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RecipeStore } from "./recipe-store.js";
import type { TokenValveConfig } from "./types.js";

const WORKSPACE = "/workspaces/token-valve";

function makeConfig(profile = "github:work"): TokenValveConfig {
  return {
    workspaces: [{
      path: WORKSPACE,
      providers: {
        github: { profile, environment: "development" }
      }
    }],
    profiles: [
      { id: "github:work", provider: "github", environment: "development", status: "verified" }
    ]
  };
}

function saveRecipe(store: RecipeStore) {
  return store.save({
    id: "github-repo-view",
    binding: {
      workspace: WORKSPACE,
      provider: "github",
      profile: "github:work",
      environment: "development",
      capability: "github-cli"
    },
    riskRules: [{ capability: "github-cli", match: ["repo", "view"], risk: "read" }],
    validationSteps: [{ id: "repo-view", description: "Run gh repo view", command: ["gh", "repo", "view"] }]
  });
}

describe("RecipeStore", () => {
  it("saves recipe metadata without secret values", () => {
    const configDir = mkdtempSync(path.join(tmpdir(), "tokenvalve-recipes-"));
    const store = new RecipeStore({ configDir, now: () => new Date("2026-07-06T00:00:00.000Z") });
    const recipe = saveRecipe(store);

    expect(recipe.status).toBe("draft");
    const filePath = path.join(configDir, "recipes.yaml");
    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath, "utf8")).not.toMatch(/secretValue|apiKey|privateKey|ghp_/i);
  });

  it("rejects secret-like fields and values", () => {
    const store = new RecipeStore({ configDir: mkdtempSync(path.join(tmpdir(), "tokenvalve-recipes-secret-")) });
    expect(() => store.save({
      id: "bad",
      binding: {
        workspace: WORKSPACE,
        provider: "github",
        profile: "github:work",
        capability: "github-cli"
      },
      validationSteps: [{ id: "bad", description: "bad", command: ["gh", "auth", "token=ghp_secret_value_1234567890"] }]
    })).toThrow(/must not contain secret-like/);
  });

  it("marks recipes verified, stale, or failed based on metadata validation", () => {
    const configDir = mkdtempSync(path.join(tmpdir(), "tokenvalve-recipes-test-"));
    const store = new RecipeStore({ configDir, now: () => new Date("2026-07-06T00:00:00.000Z") });
    saveRecipe(store);

    const verified = store.test("github-repo-view", makeConfig());
    expect(verified).toMatchObject({
      status: "verified",
      lastVerifiedAt: "2026-07-06T00:00:00.000Z",
      validationResults: [{ status: "passed" }]
    });
    expect(store.findVerified(WORKSPACE, "github-cli")?.id).toBe("github-repo-view");

    const stale = store.test("github-repo-view", makeConfig("github:missing"));
    expect(stale.status).toBe("stale");
    expect(store.findVerified(WORKSPACE, "github-cli")).toBeUndefined();

    store.save({
      id: "new-failing",
      binding: {
        workspace: WORKSPACE,
        provider: "github",
        profile: "github:missing",
        capability: "github-cli"
      }
    });
    expect(store.test("new-failing", makeConfig()).status).toBe("failed");
  });
});
