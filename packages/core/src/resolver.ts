import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import type {
  AdapterDefinition,
  CapabilityDefinition,
  ExecutionContext,
  ProfileMetadata,
  ProviderBinding,
  ResolveInput,
  ResolveResult,
  RiskLevel,
  RiskRule,
  TokenValveConfig,
  WorkspaceBinding
} from "./types.js";

export function resolveContext(input: ResolveInput): ResolveResult {
  const config = loadConfig(input.config);
  const adapters = loadAdapters(input.adapters);
  const workspace = canonicalizeWorkspace(input.workspace);
  const binding = findWorkspaceBinding(config.workspaces, workspace);

  if (!binding) {
    return blocked("workspace_not_configured", `Workspace is not configured: ${workspace}. Add a workspace binding before executing.`, {
      workspace
    });
  }

  const provider = input.execution.provider ?? inferProvider(input.execution, adapters);
  if (!provider || !binding.providers[provider]) {
    return blocked("provider_not_configured", `Provider is not configured for workspace: ${provider ?? "unknown"}.`, {
      workspace: binding.path,
      provider,
      session: getSessionResult(input, false)
    });
  }

  const workspaceProviderBinding = binding.providers[provider];
  const sessionProviderBinding = input.session?.providers?.[provider];
  const usedSessionOverride = Boolean(sessionProviderBinding);
  const providerBinding = selectProviderBinding(sessionProviderBinding ?? workspaceProviderBinding, input.execution, input.session?.client);
  const adapter = adapters.find((candidate) => candidate.provider === provider);
  if (!adapter) {
    return blocked("provider_not_configured", `Adapter is not configured for provider: ${provider}.`, {
      workspace: binding.path,
      provider,
      session: getSessionResult(input, usedSessionOverride)
    });
  }

  const profile = findProfile(config.profiles, providerBinding.profile, provider);
  if (!profile) {
    return blocked("profile_not_configured", `Profile is not configured: ${providerBinding.profile}. Check workspace or session provider bindings.`, {
      workspace: binding.path,
      provider,
      session: getSessionResult(input, usedSessionOverride)
    });
  }

  const environment = providerBinding.environment ?? profile.environment;
  if (!environment && provider !== input.execution.provider && input.execution.kind !== "llm") {
    return blocked("environment_not_configured", `Environment is not configured for provider: ${provider}.`, {
      workspace: binding.path,
      provider,
      profile: profile.id,
      session: getSessionResult(input, usedSessionOverride)
    });
  }

  const capability = findCapability(adapter.capabilities, input.execution, providerBinding);
  if (!capability) {
    return blocked("capability_not_configured", `Capability is not configured for provider: ${provider}.`, {
      workspace: binding.path,
      provider,
      profile: profile.id,
      environment,
      session: getSessionResult(input, usedSessionOverride)
    });
  }

  const risk = resolveRisk(adapter.riskRules, capability, input.execution);
  if (risk === "unknown") {
    return blocked("risk_unknown", `Risk is unknown for capability: ${capability.id}. Add a risk rule before executing.`, {
      workspace: binding.path,
      provider,
      profile: profile.id,
      environment,
      capability: capability.id,
      capabilityType: capability.type,
      risk,
      session: getSessionResult(input, usedSessionOverride)
    });
  }

  if (risk === "write" && (profile.status ?? "verified") !== "verified") {
    return blocked("profile_not_verified", `Profile is not verified for automatic write operations: ${profile.id}. Run tokenvalve secret test before executing writes.`, {
      workspace: binding.path,
      provider,
      profile: profile.id,
      environment,
      capability: capability.id,
      capabilityType: capability.type,
      risk,
      session: getSessionResult(input, usedSessionOverride)
    });
  }

  if (risk === "dangerous" || risk === "production_deploy") {
    return blocked("human_intent_required", `Human intent is required for ${risk} operations.`, {
      workspace: binding.path,
      provider,
      profile: profile.id,
      environment,
      capability: capability.id,
      capabilityType: capability.type,
      risk,
      session: getSessionResult(input, usedSessionOverride)
    });
  }

  return {
    decision: "allow",
    reason: "allowed",
    message: "Execution is allowed by configured workspace, provider, capability, and risk rules.",
    workspace: binding.path,
    provider,
    profile: profile.id,
    environment,
    capability: capability.id,
    capabilityType: capability.type,
    risk,
    session: getSessionResult(input, usedSessionOverride)
  };
}

export function loadConfig(source: TokenValveConfig | string): TokenValveConfig {
  if (typeof source !== "string") {
    return source;
  }

  return parse(readFileSync(source, "utf8")) as TokenValveConfig;
}

export function loadAdapters(source: AdapterDefinition[] | string): AdapterDefinition[] {
  if (typeof source !== "string") {
    return source;
  }

  const parsed = parse(readFileSync(source, "utf8")) as { adapters?: AdapterDefinition[] } | AdapterDefinition[];
  return Array.isArray(parsed) ? parsed : parsed.adapters ?? [];
}

export function canonicalizeWorkspace(workspace: string): string {
  const resolved = path.resolve(workspace);

  if (!existsSync(resolved)) {
    return stripTrailingSeparator(resolved);
  }

  return stripTrailingSeparator(realpathSync.native(resolved));
}

function stripTrailingSeparator(value: string): string {
  return value.length > 1 ? value.replace(/[\\/]+$/, "") : value;
}

function findWorkspaceBinding(bindings: WorkspaceBinding[], workspace: string): WorkspaceBinding | undefined {
  const canonicalBindings = bindings
    .map((binding) => ({ ...binding, path: canonicalizeWorkspace(binding.path) }))
    .filter((binding) => workspace === binding.path || workspace.startsWith(`${binding.path}${path.sep}`))
    .sort((left, right) => right.path.length - left.path.length);

  return canonicalBindings[0];
}

function inferProvider(execution: ExecutionContext, adapters: AdapterDefinition[]): string | undefined {
  if (execution.kind === "llm") {
    return execution.provider;
  }

  return adapters.find((adapter) => findCapability(adapter.capabilities, execution))?.provider;
}

function findProfile(profiles: ProfileMetadata[], profileId: string, provider: string): ProfileMetadata | undefined {
  return profiles.find((profile) => profile.id === profileId && profile.provider === provider);
}

function selectProviderBinding(binding: ProviderBinding, execution: ExecutionContext, client?: string): ProviderBinding {
  if (execution.kind !== "llm") {
    return binding;
  }

  const clientProfile = client ? binding.clientProfiles?.[client] : undefined;
  const capabilityProfile = execution.useCase ? binding.capabilityProfiles?.[execution.useCase] : undefined;
  const selectedProfile = clientProfile ?? capabilityProfile ?? binding.profile;
  return {
    ...binding,
    profile: selectedProfile
  };
}

function findCapability(
  capabilities: CapabilityDefinition[],
  execution: ExecutionContext,
  providerBinding?: ProviderBinding
): CapabilityDefinition | undefined {
  const preferredCapabilityId = execution.capability ? providerBinding?.capabilities?.[execution.capability] : undefined;
  const preferred = preferredCapabilityId
    ? capabilities.find((capability) => capability.id === preferredCapabilityId)
    : undefined;

  if (preferred && capabilityMatches(preferred, execution)) {
    return preferred;
  }

  return capabilities.find((capability) => capabilityMatches(capability, execution));
}

function capabilityMatches(capability: CapabilityDefinition, execution: ExecutionContext): boolean {
  switch (execution.kind) {
    case "cli":
      if (capability.type !== "cli-command" && capability.type !== "curl-template") {
        return false;
      }
      if (!capability.commands.includes(execution.command)) {
        return false;
      }
      if (capability.type === "curl-template" && (capability.allowedHosts || capability.pathPrefixes || capability.methods)) {
        const [method, rawUrl] = execution.args;
        if (!method || !rawUrl) {
          return false;
        }
        const url = new URL(rawUrl);
        const methodMatches = !capability.methods || capability.methods.includes(method.toUpperCase());
        const hostMatches = !capability.allowedHosts || capability.allowedHosts.includes(url.host);
        const pathMatches = !capability.pathPrefixes || capability.pathPrefixes.some((prefix) => url.pathname.startsWith(prefix));
        return methodMatches && hostMatches && pathMatches;
      }
      return true;
    case "http": {
      if (capability.type !== "http-request") {
        return false;
      }
      const url = new URL(execution.url);
      const methodMatches = !capability.methods || capability.methods.includes(execution.method.toUpperCase());
      const pathMatches = !capability.pathPrefixes || capability.pathPrefixes.some((prefix) => url.pathname.startsWith(prefix));
      return capability.allowedHosts.includes(url.host) && methodMatches && pathMatches;
    }
    case "llm":
      return capability.type === "llm-api-key"
        && capability.provider === execution.provider
        && (!execution.useCase || !capability.useCases || capability.useCases.includes(execution.useCase));
    case "host-operation":
      return capability.type === execution.type
        && capability.allowedHosts.includes(execution.host)
        && (!execution.operation || !capability.operations || capability.operations.includes(execution.operation));
    case "script":
      return capability.type === "script-command" && capability.scripts.includes(execution.script);
  }
}

function resolveRisk(rules: RiskRule[], capability: CapabilityDefinition, execution: ExecutionContext): RiskLevel {
  const rule = rules
    .filter((candidate) => riskRuleMatches(candidate, capability, execution))
    .sort((left, right) => riskRuleSpecificity(right) - riskRuleSpecificity(left))[0];
  return rule?.risk ?? "unknown";
}

function riskRuleMatches(rule: RiskRule, capability: CapabilityDefinition, execution: ExecutionContext): boolean {
  if (rule.capability && rule.capability !== capability.id) {
    return false;
  }

  switch (execution.kind) {
    case "cli":
      return matchArgs(rule.match, execution.args);
    case "http": {
      const url = new URL(execution.url);
      const methodMatches = !rule.method || rule.method.toUpperCase() === execution.method.toUpperCase();
      const pathMatches = !rule.pathPrefix || url.pathname.startsWith(rule.pathPrefix);
      return methodMatches && pathMatches;
    }
    case "llm":
      return !rule.useCase || rule.useCase === execution.useCase;
    case "host-operation":
      return !rule.operation || rule.operation === execution.operation;
    case "script":
      return matchArgs(rule.match, [execution.script]);
  }
}

function matchArgs(expected: string[] | undefined, actual: string[]): boolean {
  if (!expected) {
    return true;
  }

  let cursor = 0;
  for (const part of actual) {
    if (part === expected[cursor]) {
      cursor += 1;
    }
    if (cursor === expected.length) {
      return true;
    }
  }

  return false;
}

function riskRuleSpecificity(rule: RiskRule): number {
  return [
    rule.capability ? 10 : 0,
    rule.match?.length ?? 0,
    rule.method ? 2 : 0,
    rule.pathPrefix ? rule.pathPrefix.length : 0,
    rule.operation ? 2 : 0,
    rule.useCase ? 2 : 0
  ].reduce((total, value) => total + value, 0);
}

function blocked(
  reason: ResolveResult["reason"],
  message: string,
  partial: Partial<Omit<ResolveResult, "decision" | "reason" | "message">> = {}
): ResolveResult {
  return {
    decision: "blocked",
    reason,
    message,
    ...partial
  };
}

function getSessionResult(input: ResolveInput, usedOverride: boolean): ResolveResult["session"] {
  if (!input.session) {
    return undefined;
  }

  return {
    id: input.session.id,
    client: input.session.client,
    usedOverride
  };
}
