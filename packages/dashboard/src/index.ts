import type {
  CustomProviderMapping,
  HumanIntentGrant,
  ProfileMetadata,
  TokenValveRecipe,
  WorkspaceBinding
} from "@tokenvalve/core";

export const tokenValveDashboardPackage = "@tokenvalve/dashboard";

export interface DashboardSnapshot {
  workspace: string;
  profiles: ProfileMetadata[];
  bindings: WorkspaceBinding[];
  intents: HumanIntentGrant[];
  recipes: TokenValveRecipe[];
  customProviders: CustomProviderMapping[];
  doctor: {
    status: "ok" | "warning" | "error";
    message: string;
  };
  audits?: {
    available: boolean;
    summary: string[];
  };
}

export function getDashboardStatus(): string {
  return "dashboard renderer ready";
}

export function renderDashboard(snapshot: DashboardSnapshot): string {
  const lines = [
    "TokenValve dashboard",
    `Workspace: ${sanitize(snapshot.workspace)}`,
    "",
    "Workspace bindings:",
    ...formatBindings(snapshot.bindings),
    "",
    "Profiles:",
    ...formatProfiles(snapshot.profiles),
    "",
    "Active intents:",
    ...formatIntents(snapshot.intents),
    "",
    "Recipes:",
    ...formatRecipes(snapshot.recipes),
    "",
    "Custom providers:",
    ...formatCustomProviders(snapshot.customProviders),
    "",
    "Audit:",
    ...formatAudit(snapshot.audits),
    "",
    "Doctor:",
    `- ${snapshot.doctor.status}: ${sanitize(snapshot.doctor.message)}`
  ];

  return `${lines.join("\n")}\n`;
}

export function renderDashboardUseResult(input: { workspace: string; provider: string; profile: string; environment?: string }): string {
  return [
    "TokenValve dashboard use",
    `- workspace: ${sanitize(input.workspace)}`,
    `- provider: ${sanitize(input.provider)}`,
    `- profile: ${sanitize(input.profile)}`,
    `- environment: ${sanitize(input.environment ?? "none")}`,
    "- secret value: not displayed",
    "- global auth state: unchanged"
  ].join("\n") + "\n";
}

function formatBindings(bindings: WorkspaceBinding[]): string[] {
  if (bindings.length === 0) {
    return ["- none configured"];
  }
  return bindings.flatMap((binding) => [
    `- ${sanitize(binding.path)}`,
    ...Object.entries(binding.providers).map(([provider, value]) =>
      `  - ${sanitize(provider)} -> ${sanitize(value.profile)} (${sanitize(value.environment ?? "environment not set")})`
    )
  ]);
}

function formatProfiles(profiles: ProfileMetadata[]): string[] {
  if (profiles.length === 0) {
    return ["- none configured"];
  }
  return profiles.map((profile) => [
    `- ${sanitize(profile.id)}`,
    `provider=${sanitize(profile.provider)}`,
    `status=${sanitize(profile.status ?? "unverified")}`,
    `environment=${sanitize(profile.environment ?? "none")}`,
    profile.maskedFingerprint ? `fingerprint=${sanitize(profile.maskedFingerprint)}` : undefined,
    profile.llm ? "llm=yes" : undefined
  ].filter(Boolean).join(" "));
}

function formatIntents(intents: HumanIntentGrant[]): string[] {
  const active = intents.filter((intent) => intent.status === "active");
  if (active.length === 0) {
    return ["- none active"];
  }
  return active.map((intent) =>
    `- ${sanitize(intent.id)} provider=${sanitize(intent.scope.provider)} profile=${sanitize(intent.scope.profile)} risk=${sanitize(intent.scope.risk)} expiresAt=${sanitize(intent.expiresAt)}`
  );
}

function formatRecipes(recipes: TokenValveRecipe[]): string[] {
  if (recipes.length === 0) {
    return ["- none saved"];
  }
  return recipes.map((recipe) =>
    `- ${sanitize(recipe.id)} status=${sanitize(recipe.status)} provider=${sanitize(recipe.binding.provider)} profile=${sanitize(recipe.binding.profile)} capability=${sanitize(recipe.binding.capability)}`
  );
}

function formatCustomProviders(providers: CustomProviderMapping[]): string[] {
  if (providers.length === 0) {
    return ["- none configured"];
  }
  return providers.flatMap((provider) => [
    `- ${sanitize(provider.provider)}`,
    ...provider.capabilities.map((capability) =>
      `  - ${sanitize(capability.id)} type=${sanitize(capability.type)} riskRules=${capability.riskRules.length}`
    )
  ]);
}

function formatAudit(audits: DashboardSnapshot["audits"]): string[] {
  if (!audits?.available) {
    return ["- no persistent audit source yet"];
  }
  if (audits.summary.length === 0) {
    return ["- no recent audit events"];
  }
  return audits.summary.map((entry) => `- ${sanitize(entry)}`);
}

function sanitize(value: string): string {
  return value
    .replace(/gh[pousr]_[a-z0-9_]+/gi, "[REDACTED]")
    .replace(/github_pat_[a-z0-9_]+/gi, "[REDACTED]")
    .replace(/sk-[a-z0-9_-]+/gi, "[REDACTED]")
    .replace(/Bearer\s+[a-z0-9._-]+/gi, "Bearer [REDACTED]")
    .replace(/-----BEGIN [\s\S]+?-----END [^-]+-----/g, "[REDACTED_PRIVATE_KEY]");
}
