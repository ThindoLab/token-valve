import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CustomProviderStore,
  customProvidersToAdapters,
  findCustomHttpTemplate,
  findCustomScriptTemplate
} from "./custom-provider.js";

describe("CustomProviderStore", () => {
  it("saves custom HTTP and script mappings without plaintext secrets", () => {
    const configDir = mkdtempSync(path.join(tmpdir(), "tokenvalve-custom-"));
    const store = new CustomProviderStore({ configDir });

    store.saveHttpMapping({
      provider: "internal-api",
      capability: "internal-status",
      allowedHosts: ["internal.example.test"],
      pathPrefixes: ["/status"],
      methods: ["get"],
      headers: { Authorization: "Bearer {{token}}" },
      riskRules: [{ capability: "internal-status", method: "GET", pathPrefix: "/status", risk: "read" }]
    });
    store.saveScriptMapping({
      provider: "internal-tool",
      capability: "internal-script",
      scripts: ["/usr/local/bin/internal-tool"],
      env: { INTERNAL_TOKEN: "{{token}}" },
      riskRules: [{ capability: "internal-script", match: ["/usr/local/bin/internal-tool"], risk: "read" }]
    });

    const file = readFileSync(path.join(configDir, "custom-providers.yaml"), "utf8");
    expect(file).toContain("internal-api");
    expect(file).toContain("Bearer {{token}}");
    expect(file).not.toMatch(/ghp_|sk-|secretValue/i);

    const providers = store.list();
    const adapters = customProvidersToAdapters(providers);
    expect(adapters).toMatchObject([
      { provider: "internal-api", capabilities: [{ id: "internal-status", type: "http-request" }] },
      { provider: "internal-tool", capabilities: [{ id: "internal-script", type: "script-command" }] }
    ]);
    expect(findCustomHttpTemplate(providers, "internal-api", "internal-status")).toMatchObject({
      headers: { Authorization: "Bearer {{token}}" }
    });
    expect(findCustomScriptTemplate(providers, "internal-tool", "internal-script")).toMatchObject({
      env: { INTERNAL_TOKEN: "{{token}}" }
    });
  });

  it("rejects plaintext secret-like values in custom mappings", () => {
    const store = new CustomProviderStore({ configDir: mkdtempSync(path.join(tmpdir(), "tokenvalve-custom-secret-")) });

    expect(() => store.saveHttpMapping({
      provider: "bad-api",
      capability: "bad",
      allowedHosts: ["bad.example.test"],
      headers: { Authorization: "Bearer ghp_plaintext_secret_value_1234567890" },
      riskRules: [{ capability: "bad", risk: "read" }]
    })).toThrow(/must not contain plaintext secret/);
  });
});
