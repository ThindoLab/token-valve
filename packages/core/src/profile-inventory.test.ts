import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { canonicalizeWorkspace } from "./resolver.js";
import { MemorySecretStore } from "./secret-store.js";
import { ProfileInventory } from "./profile-inventory.js";

const SECRET = "ghp_phase7_secret_value";

function makeInventory() {
  const root = mkdtempSync(path.join(tmpdir(), "tokenvalve-profile-"));
  const store = new MemorySecretStore();
  const configDir = path.join(root, ".tokenvalve");
  return {
    root,
    configDir,
    store,
    inventory: new ProfileInventory({ configDir, store })
  };
}

describe("ProfileInventory", () => {
  it("adds a profile, writes secret store value, and keeps YAML secret-free", async () => {
    const { root, configDir, store, inventory } = makeInventory();
    const result = await inventory.addProfile({
      profileId: "github:work",
      provider: "github",
      environment: "development",
      useCases: ["cli"],
      workspace: root,
      secretValue: SECRET,
      yes: true
    });

    expect(result.profile).toMatchObject({
      id: "github:work",
      provider: "github",
      environment: "development",
      status: "unverified",
      useCases: ["cli"],
      boundWorkspaces: [canonicalizeWorkspace(root)]
    });
    await expect(store.readSecret(result.secretRef)).resolves.toBe(SECRET);

    const profilesYaml = readFileSync(path.join(configDir, "profiles.yaml"), "utf8");
    const bindings = parse(readFileSync(path.join(configDir, "bindings.yaml"), "utf8")) as {
      workspaces: Array<{ providers: { github: { profile: string } } }>;
    };
    expect(profilesYaml).toContain("maskedFingerprint");
    expect(profilesYaml).not.toContain(SECRET);
    expect(bindings.workspaces[0]?.providers.github.profile).toBe("github:work");
  });

  it("verifies a profile when a non-empty secret exists", async () => {
    const { inventory } = makeInventory();
    await inventory.addProfile({
      profileId: "github:work",
      provider: "github",
      secretValue: SECRET,
      yes: true
    });

    const result = await inventory.testProfile({ profileId: "github:work" });
    expect(result.profile.status).toBe("verified");
    expect(result.profile.lastVerifiedAt).toEqual(expect.any(String));
  });

  it("updates a secret and resets status to unverified", async () => {
    const { inventory } = makeInventory();
    await inventory.addProfile({
      profileId: "github:work",
      provider: "github",
      secretValue: SECRET,
      yes: true
    });
    const verified = await inventory.testProfile({ profileId: "github:work" });

    const result = await inventory.updateProfile({
      profileId: "github:work",
      secretValue: "ghp_replaced_secret_value",
      yes: true
    });

    expect(verified.profile.maskedFingerprint).not.toBe(result.profile.maskedFingerprint);
    expect(result.profile.status).toBe("unverified");
    expect(result.profile.lastVerifiedAt).toBeUndefined();
  });

  it("deletes profile metadata, workspace bindings, and secret store value", async () => {
    const { root, store, inventory } = makeInventory();
    const added = await inventory.addProfile({
      profileId: "github:work",
      provider: "github",
      workspace: root,
      secretValue: SECRET,
      yes: true
    });

    await expect(inventory.deleteProfile({ profileId: "github:work", yes: true })).resolves.toMatchObject({
      id: "github:work"
    });
    expect(inventory.listProfiles()).toEqual([]);
    await expect(store.readSecret(added.secretRef)).resolves.toBeNull();
  });

  it("rejects risky write paths without explicit confirmation", async () => {
    const { inventory } = makeInventory();
    await expect(inventory.addProfile({
      profileId: "github:work",
      provider: "github",
      secretValue: SECRET,
      yes: false
    })).rejects.toThrow(/requires --yes/);
  });

  it("rejects duplicate profiles unless replace is explicit", async () => {
    const { inventory } = makeInventory();
    await inventory.addProfile({
      profileId: "github:work",
      provider: "github",
      secretValue: SECRET,
      yes: true
    });

    await expect(inventory.addProfile({
      profileId: "github:work",
      provider: "github",
      secretValue: SECRET,
      yes: true
    })).rejects.toThrow(/already exists/);
  });
});
