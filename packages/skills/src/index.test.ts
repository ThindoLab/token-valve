import { describe, expect, it } from "vitest";
import {
  continueOnboardingWithVerification,
  createOnboardingPlan,
  getSkillsStatus
} from "./index.js";

const workspace = "/tmp/token-valve-workspace";

describe("skills package", () => {
  it("exposes the orchestration status", () => {
    expect(getSkillsStatus()).toBe("skills orchestration ready");
  });

  it("creates a GitHub onboarding plan and saves a verified recipe after passed verification", () => {
    const plan = createOnboardingPlan({
      provider: "github",
      profile: "github-personal",
      workspace,
      capability: "cli-command",
      risk: "read"
    });

    expect(plan.status).toBe("ready");
    expect(plan.guidance.join(" ")).toContain("不要把 GitHub token 粘贴进 Agent 对话");
    expect(plan.mcpCalls.map((call) => call.tool)).toEqual(["secret_profile_create", "secret_profile_test"]);
    expect(JSON.stringify(plan.mcpCalls)).not.toContain("ghp_");

    const verified = continueOnboardingWithVerification({
      provider: "github",
      profile: "github-personal",
      workspace,
      capability: "cli-command",
      risk: "read"
    }, {
      status: "passed",
      checkedAt: "2026-07-06T00:00:00.000Z",
      message: "GitHub account read succeeded."
    });

    const recipeSave = verified.mcpCalls.find((call) => call.tool === "recipe_save");
    expect(verified.status).toBe("verified");
    expect(recipeSave?.input).toMatchObject({
      id: "github-github-personal-cli-command",
      status: "verified",
      binding: {
        workspace,
        provider: "github",
        profile: "github-personal",
        capability: "cli-command"
      }
    });
  });

  it("asks for missing profile and workspace before creating recipe calls", () => {
    const plan = createOnboardingPlan({ provider: "github" });

    expect(plan.status).toBe("needs_input");
    expect(plan.missing.map((question) => question.field)).toEqual(["profile", "workspace"]);
    expect(plan.mcpCalls).toEqual([]);
  });

  it("does not create a verified recipe when Supabase verification fails", () => {
    const plan = continueOnboardingWithVerification({
      provider: "supabase",
      profile: "supabase-staging",
      workspace,
      capability: "http-request",
      risk: "read"
    }, {
      status: "failed",
      message: "Bearer abcdefghijklmnopqrstuvwxyz was rejected."
    });

    expect(plan.status).toBe("failed");
    expect(plan.repairSuggestions.join(" ")).toContain("验证失败");
    expect(plan.repairSuggestions.join(" ")).not.toContain("abcdefghijklmnopqrstuvwxyz");
    expect(plan.mcpCalls.some((call) => call.tool === "recipe_save")).toBe(false);
  });

  it("creates LLM onboarding metadata without API key values", () => {
    const plan = createOnboardingPlan({
      provider: "llm",
      llmProvider: "openai",
      profile: "openai-work",
      workspace,
      capability: "llm-api-key",
      useCases: ["coding", "review"]
    });

    expect(plan.status).toBe("ready");
    expect(plan.mcpCalls[0]?.input).toMatchObject({
      provider: "llm-openai",
      profile: "openai-work",
      workspace,
      useCases: ["coding", "review"],
      metadata: {
        llmProvider: "openai",
        providerKind: "llm"
      }
    });
    expect(JSON.stringify(plan)).not.toMatch(/sk-/i);
  });

  it("keeps custom secret onboarding generic until mapping is configured", () => {
    const plan = createOnboardingPlan({
      provider: "custom",
      profile: "internal-api",
      workspace,
      capability: "http-request"
    });

    expect(plan.status).toBe("ready");
    expect(plan.guidance.join(" ")).toContain("完整 env/header/request/SSH/LLM mapping");
    expect(plan.mcpCalls.map((call) => call.tool)).toEqual(["secret_profile_create", "secret_profile_test"]);
    expect(plan.mcpCalls.some((call) => call.tool === "recipe_save")).toBe(false);
  });

  it("rejects secret-like metadata without echoing the value", () => {
    const plan = createOnboardingPlan({
      provider: "github",
      profile: "github-personal",
      workspace,
      metadata: {
        note: "ghp_abcdefghijklmnopqrstuvwxyz1234567890"
      }
    });

    expect(plan.status).toBe("failed");
    expect(plan.repairSuggestions.join(" ")).toContain("疑似明文密钥");
    expect(JSON.stringify(plan)).not.toContain("abcdefghijklmnopqrstuvwxyz1234567890");
    expect(plan.mcpCalls).toEqual([]);
  });
});
