import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { runScenarioInit } from "./init.js";

function makeWorkspace(): string {
  return mkdtempSync(path.join(tmpdir(), "tokenvalve-init-"));
}

describe("runScenarioInit", () => {
  it("writes readable config files and a dry-run matrix", () => {
    const workspace = makeWorkspace();
    const configDir = path.join(workspace, ".tokenvalve");
    const result = runScenarioInit({
      workspace,
      configDir,
      providers: ["github", "supabase"],
      llmKeys: ["openai:work"],
      yes: true,
      cliAvailability: { gh: true, supabase: false, vercel: false }
    });

    expect(result.writtenFiles.map((filePath) => path.basename(filePath)).sort()).toEqual([
      "bindings.yaml",
      "config.yaml",
      "policies.yaml",
      "profiles.yaml"
    ]);
    expect(result.dryRunMatrix.some((row) => row.label === "GitHub repo view" && row.decision === "allow")).toBe(true);
    expect(result.dryRunMatrix.some((row) => row.label === "OpenAI code generation" && row.decision === "allow")).toBe(true);

    const profiles = parse(readFileSync(path.join(configDir, "profiles.yaml"), "utf8")) as { profiles: Array<{ id: string }> };
    expect(profiles.profiles.map((profile) => profile.id)).toEqual([
      "github:default",
      "supabase:default:staging",
      "openai:work"
    ]);
    expect(readFileSync(path.join(configDir, "profiles.yaml"), "utf8")).not.toMatch(/secret|sk-/i);
  });

  it("does not write files in dry-run mode", () => {
    const workspace = makeWorkspace();
    const result = runScenarioInit({
      workspace,
      configDir: path.join(workspace, ".tokenvalve"),
      providers: ["github"],
      yes: true,
      dryRun: true
    });

    expect(result.writtenFiles).toEqual([]);
    expect(result.files.profiles.profiles.map((profile) => profile.id)).toEqual(["github:default"]);
  });

  it("adds providers incrementally without auto-managing unselected providers", () => {
    const workspace = makeWorkspace();
    const configDir = path.join(workspace, ".tokenvalve");

    runScenarioInit({
      workspace,
      configDir,
      providers: ["github"],
      yes: true
    });

    const result = runScenarioInit({
      workspace,
      configDir,
      providers: [],
      addProviders: ["vercel"],
      yes: true
    });

    const providerNames = Object.keys(result.files.bindings.workspaces[0]?.providers ?? {});
    expect(providerNames.sort()).toEqual(["github", "vercel"]);
    expect(providerNames).not.toContain("supabase");
    expect(result.dryRunMatrix.find((row) => row.label === "Vercel deploy --prod")).toMatchObject({
      decision: "blocked",
      reason: "human_intent_required"
    });
  });

  it("requires explicit non-interactive confirmation", () => {
    expect(() => runScenarioInit({
      workspace: makeWorkspace(),
      configDir: path.join(makeWorkspace(), ".tokenvalve"),
      providers: ["github"],
      yes: false
    })).toThrow(/requires --yes/);
  });
});
