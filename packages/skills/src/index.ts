import type { RecipeStatus, RiskLevel } from "@tokenvalve/core";

export const tokenValveSkillsPackage = "@tokenvalve/skills";

export type OnboardingProvider = "github" | "supabase" | "llm" | "custom";
export type OnboardingStatus = "needs_input" | "ready" | "verified" | "failed";

export interface OnboardingInput {
  provider: OnboardingProvider;
  profile?: string;
  workspace?: string;
  capability?: string;
  risk?: RiskLevel;
  environment?: string;
  displayName?: string;
  llmProvider?: "openai" | "anthropic" | "gemini" | "openrouter" | "custom" | "internal";
  useCases?: string[];
  metadata?: Record<string, unknown>;
}

export interface VerificationInput {
  status: "passed" | "failed";
  message?: string;
  checkedAt?: string;
}

export interface McpCallDraft {
  tool: "secret_profile_create" | "secret_profile_test" | "recipe_save";
  input: Record<string, unknown>;
}

export interface OnboardingQuestion {
  field: string;
  prompt: string;
}

export interface OnboardingPlan {
  status: OnboardingStatus;
  provider: OnboardingProvider;
  profile?: string;
  workspace?: string;
  capability?: string;
  risk: RiskLevel;
  title: string;
  guidance: string[];
  missing: OnboardingQuestion[];
  mcpCalls: McpCallDraft[];
  repairSuggestions: string[];
}

interface ProviderTemplate {
  title: string;
  defaultCapability: string;
  defaultRisk: RiskLevel;
  verificationDescription: string;
  useCases: string[];
  guidance: string[];
}

const PROVIDER_TEMPLATES: Record<OnboardingProvider, ProviderTemplate> = {
  github: {
    title: "新增 GitHub key",
    defaultCapability: "cli-command",
    defaultRisk: "read",
    verificationDescription: "使用本地保存的 GitHub credential 执行账号读取验证。",
    useCases: ["github-cli", "github-http", "git-https"],
    guidance: [
      "我会先创建 GitHub profile 元数据，再触发本地受控输入。",
      "不要把 GitHub token 粘贴进 Agent 对话；密钥只应进入本地输入通道。"
    ]
  },
  supabase: {
    title: "新增 Supabase key",
    defaultCapability: "http-request",
    defaultRisk: "read",
    verificationDescription: "使用本地保存的 Supabase credential 执行项目或账号读取验证。",
    useCases: ["supabase-cli", "supabase-management-api", "curl-template"],
    guidance: [
      "我会把 Supabase 的用途和环境写成 profile 元数据，再通过 MCP 触发验证。",
      "生产写操作后续仍需要 human intent，不会因为新增 key 自动放开。"
    ]
  },
  llm: {
    title: "新增 LLM API key",
    defaultCapability: "llm-api-key",
    defaultRisk: "read",
    verificationDescription: "使用本地保存的 LLM key 执行 provider 级轻量验证。",
    useCases: ["llm-api-key"],
    guidance: [
      "我会记录 LLM provider、用途和 workspace 默认绑定。",
      "API key 不进入 prompt、日志、MCP 参数或 Recipe。"
    ]
  },
  custom: {
    title: "新增 Custom secret",
    defaultCapability: "http-request",
    defaultRisk: "unknown",
    verificationDescription: "等待 custom provider mapping 配置后执行对应验证。",
    useCases: ["custom-secret"],
    guidance: [
      "我会先沉淀 custom secret 的元数据和风险意图。",
      "完整 env/header/request/SSH/LLM mapping 会在后续配置中补齐。"
    ]
  }
};

export function getSkillsStatus(): string {
  return "skills orchestration ready";
}

export function createOnboardingPlan(input: OnboardingInput): OnboardingPlan {
  const secretFinding = findSecretLikeEntry(input);
  if (secretFinding) {
    return failedPlan(input, [
      "检测到疑似明文密钥。请不要把 token、API key、private key 或 Bearer credential 放进 Agent 对话。",
      "请改用 TokenValve 的本地受控输入通道录入密钥。"
    ]);
  }

  const template = PROVIDER_TEMPLATES[input.provider];
  const capability = input.capability ?? template.defaultCapability;
  const risk = input.risk ?? template.defaultRisk;
  const missing = requiredQuestions(input);
  const base = basePlan(input, capability, risk, missing);

  if (missing.length > 0) {
    return {
      ...base,
      status: "needs_input",
      guidance: [
        ...base.guidance,
        "我还需要补齐下面的信息，补齐前不会保存 Recipe。"
      ]
    };
  }

  return {
    ...base,
    status: "ready",
    mcpCalls: [
      createProfileCall(input, capability),
      testProfileCall(input, template)
    ]
  };
}

export function continueOnboardingWithVerification(input: OnboardingInput, verification: VerificationInput): OnboardingPlan {
  const initial = createOnboardingPlan(input);
  if (initial.status !== "ready") {
    return initial;
  }

  if (verification.status === "failed") {
    return {
      ...initial,
      status: "failed",
      mcpCalls: initial.mcpCalls,
      repairSuggestions: [
        verification.message ? `验证失败：${redactText(verification.message)}` : "验证失败：请检查 profile、provider、workspace binding 和本地录入的凭证是否匹配。",
        "失败结果不会保存为 verified Recipe；修复后请重新测试。"
      ]
    };
  }

  return {
    ...initial,
    status: "verified",
    guidance: [
      ...initial.guidance,
      "验证已通过，可以保存为下次 Agent 自动复用的 verified Recipe。"
    ],
    mcpCalls: [
      ...initial.mcpCalls,
      saveRecipeCall(input, verification)
    ]
  };
}

function basePlan(input: OnboardingInput, capability: string, risk: RiskLevel, missing: OnboardingQuestion[]): OnboardingPlan {
  const template = PROVIDER_TEMPLATES[input.provider];
  return {
    status: "needs_input",
    provider: input.provider,
    profile: input.profile,
    workspace: input.workspace,
    capability,
    risk,
    title: template.title,
    guidance: template.guidance,
    missing,
    mcpCalls: [],
    repairSuggestions: []
  };
}

function failedPlan(input: OnboardingInput, repairSuggestions: string[]): OnboardingPlan {
  const template = PROVIDER_TEMPLATES[input.provider];
  return {
    status: "failed",
    provider: input.provider,
    profile: input.profile,
    workspace: input.workspace,
    capability: input.capability ?? template.defaultCapability,
    risk: input.risk ?? template.defaultRisk,
    title: template.title,
    guidance: [],
    missing: [],
    mcpCalls: [],
    repairSuggestions
  };
}

function requiredQuestions(input: OnboardingInput): OnboardingQuestion[] {
  const questions: OnboardingQuestion[] = [];
  if (!input.profile) {
    questions.push({ field: "profile", prompt: "这个密钥对应哪个 profile 名称？例如 github-personal 或 openai-work。" });
  }
  if (!input.workspace) {
    questions.push({ field: "workspace", prompt: "这个密钥默认绑定到哪个 workspace？" });
  }
  if (input.provider === "llm" && !input.llmProvider) {
    questions.push({ field: "llmProvider", prompt: "这个 LLM key 属于 OpenAI、Anthropic、Gemini、OpenRouter 还是 custom/internal？" });
  }
  return questions;
}

function createProfileCall(input: OnboardingInput, capability: string): McpCallDraft {
  const template = PROVIDER_TEMPLATES[input.provider];
  return {
    tool: "secret_profile_create",
    input: compactRecord({
      provider: providerName(input),
      profile: input.profile,
      workspace: input.workspace,
      environment: input.environment,
      displayName: input.displayName,
      useCases: input.useCases ?? template.useCases,
      capability,
      localInput: {
        mode: "local-only",
        instruction: "通过 TokenValve 本地受控输入录入凭证，不要经过 Agent prompt。"
      },
      metadata: safeMetadata(input)
    })
  };
}

function testProfileCall(input: OnboardingInput, template: ProviderTemplate): McpCallDraft {
  return {
    tool: "secret_profile_test",
    input: compactRecord({
      provider: providerName(input),
      profile: input.profile,
      workspace: input.workspace,
      verification: {
        description: template.verificationDescription,
        mode: "provider-template"
      }
    })
  };
}

function saveRecipeCall(input: OnboardingInput, verification: VerificationInput): McpCallDraft {
  const template = PROVIDER_TEMPLATES[input.provider];
  const capability = input.capability ?? template.defaultCapability;
  return {
    tool: "recipe_save",
    input: {
      id: recipeId(input.provider, input.profile ?? "profile", capability),
      status: "verified" satisfies RecipeStatus,
      binding: compactRecord({
        workspace: input.workspace,
        provider: providerName(input),
        profile: input.profile,
        environment: input.environment,
        capability
      }),
      riskRules: [{
        capability,
        risk: input.risk ?? template.defaultRisk
      }],
      validationSteps: [{
        id: "provider-template-test",
        description: template.verificationDescription
      }],
      validationResults: [{
        status: "passed",
        checkedAt: verification.checkedAt ?? new Date(0).toISOString(),
        message: redactText(verification.message ?? "验证通过。")
      }]
    }
  };
}

function safeMetadata(input: OnboardingInput): Record<string, unknown> | undefined {
  const metadata = compactRecord({
    ...input.metadata,
    llmProvider: input.llmProvider,
    providerKind: input.provider
  });
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function providerName(input: OnboardingInput): string {
  if (input.provider === "llm") {
    return input.llmProvider ? `llm-${input.llmProvider}` : "llm";
  }
  return input.provider;
}

function recipeId(provider: string, profile: string, capability: string): string {
  return [provider, profile, capability]
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function compactRecord(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function findSecretLikeEntry(value: unknown): string | undefined {
  if (typeof value === "string") {
    return isSecretLikeText(value) ? redactText(value) : undefined;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findSecretLikeEntry(entry);
      if (found) {
        return found;
      }
    }
    return undefined;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (isSecretFieldName(key)) {
        return key;
      }
      const found = findSecretLikeEntry(entry);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

function isSecretFieldName(value: string): boolean {
  return /secret|token|api[_-]?key|private[_-]?key|credential/i.test(value);
}

function isSecretLikeText(value: string): boolean {
  return /(ghp_|gho_|github_pat_|sk-[a-z0-9_-]{16,}|Bearer\s+[a-z0-9._-]{16,}|BEGIN [A-Z ]*PRIVATE KEY|eyJ[a-z0-9_-]{20,})/i.test(value);
}

function redactText(value: string): string {
  return value
    .replace(/gh[pousr]_[a-z0-9_]+/gi, "[REDACTED]")
    .replace(/github_pat_[a-z0-9_]+/gi, "[REDACTED]")
    .replace(/sk-[a-z0-9_-]+/gi, "[REDACTED]")
    .replace(/Bearer\s+[a-z0-9._-]+/gi, "Bearer [REDACTED]")
    .replace(/-----BEGIN [\s\S]+?-----END [^-]+-----/g, "[REDACTED_PRIVATE_KEY]")
    .replace(/eyJ[a-z0-9_-]{20,}/gi, "[REDACTED]");
}
