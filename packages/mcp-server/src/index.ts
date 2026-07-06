import {
  GITHUB_ADAPTER,
  HumanIntentStore,
  MemorySecretStore,
  ProfileInventory,
  RecipeStore,
  SSH_ADAPTER,
  SUPABASE_ADAPTER,
  VERCEL_ADAPTER,
  redactJsonValue,
  resolveContext,
  runGitHubCli,
  runGitSsh,
  runHttpRequest,
  runSshCommand,
  runSupabaseCli,
  runVercelCli,
  type AdapterDefinition,
  type AgentSessionContext,
  type AuditEvent,
  type HttpRunner,
  type ProcessRunner,
  type ProfileMetadata,
  type RecipeBinding,
  type RecipeStatus,
  type RiskLevel,
  type SecretStore,
  type TokenValveConfig
} from "@tokenvalve/core";

export const tokenValveMcpServerPackage = "@tokenvalve/mcp-server";

export const MCP_TOOL_NAMES = [
  "profiles_list",
  "context_resolve",
  "llm_profile_resolve",
  "exec_with_secrets",
  "http_request_with_secrets",
  "ssh_with_secrets",
  "intent_request",
  "revoke",
  "secret_profile_create",
  "secret_profile_test",
  "recipe_save",
  "recipe_list",
  "ui_open",
  "audit_list"
] as const;

export type McpToolName = typeof MCP_TOOL_NAMES[number];

export interface McpToolDefinition {
  name: McpToolName;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpToolResult {
  ok: boolean;
  data?: unknown;
  error?: {
    code: string;
    message: string;
  };
  audit?: AuditEvent;
}

export interface TokenValveMcpServerOptions {
  configDir?: string;
  config?: TokenValveConfig;
  adapters?: AdapterDefinition[];
  secretStore?: SecretStore;
  processRunner?: ProcessRunner;
  httpRunner?: HttpRunner;
}

interface PendingIntentRequest {
  id: string;
  status: "pending";
  source: "mcp-request";
  scope: {
    workspace: string;
    provider: string;
    profile: string;
    environment: string;
    risk: RiskLevel;
  };
  createdAt: string;
}

interface RecipeMetadata {
  id: string;
  status: RecipeStatus;
  provider?: string;
  profile?: string;
  capability?: string;
  workspace?: string;
  createdAt: string;
}

export class TokenValveMcpServer {
  private readonly configDir?: string;
  private readonly explicitConfig?: TokenValveConfig;
  private readonly adapters: AdapterDefinition[];
  private readonly secretStore: SecretStore;
  private readonly processRunner?: ProcessRunner;
  private readonly httpRunner?: HttpRunner;
  private readonly pendingIntents: PendingIntentRequest[] = [];
  private readonly recipes: RecipeMetadata[] = [];
  private readonly audits: AuditEvent[] = [];

  public constructor(options: TokenValveMcpServerOptions = {}) {
    this.configDir = options.configDir;
    this.explicitConfig = options.config;
    this.adapters = options.adapters ?? [GITHUB_ADAPTER, SUPABASE_ADAPTER, VERCEL_ADAPTER, SSH_ADAPTER];
    this.secretStore = options.secretStore ?? new MemorySecretStore();
    this.processRunner = options.processRunner;
    this.httpRunner = options.httpRunner;
  }

  public listTools(): McpToolDefinition[] {
    return MCP_TOOL_NAMES.map((name) => ({
      name,
      description: toolDescription(name),
      inputSchema: { type: "object" }
    }));
  }

  public async callTool(name: string, input: unknown = {}): Promise<McpToolResult> {
    if (!isToolName(name)) {
      return errorResult("tool_not_found", `Unknown MCP tool: ${name}.`);
    }
    if (!isRecord(input)) {
      return errorResult("invalid_input", "MCP tool input must be a JSON object.");
    }

    try {
      if (["exec_with_secrets", "http_request_with_secrets", "ssh_with_secrets"].includes(name) && hasShellString(input)) {
        return errorResult("structured_args_required", "Execution tools only accept structured parameters, not shell strings.");
      }

      const result = await this.dispatch(name, input);
      return {
        ...result,
        data: result.data === undefined ? undefined : redactJsonValue(result.data)
      };
    } catch (error) {
      return errorResult("tool_error", error instanceof Error ? error.message : String(error));
    }
  }

  private async dispatch(name: McpToolName, input: Record<string, unknown>): Promise<McpToolResult> {
    switch (name) {
      case "profiles_list":
        return { ok: true, data: { profiles: this.getConfig().profiles.map(redactProfileMetadata) } };
      case "context_resolve":
        return { ok: true, data: resolveContext({
          workspace: requireString(input.workspace, "workspace"),
          config: this.getConfig(),
          adapters: this.adapters,
          session: parseSession(input.session),
          execution: requireRecord(input.execution, "execution")
        }) };
      case "llm_profile_resolve":
        return { ok: true, data: resolveContext({
          workspace: requireString(input.workspace, "workspace"),
          config: this.getConfig(),
          adapters: this.adapters,
          session: parseSession(input.session),
          execution: {
            kind: "llm",
            provider: requireString(input.provider, "provider"),
            useCase: optionalString(input.useCase)
          }
        }) };
      case "exec_with_secrets":
        return this.execWithSecrets(input);
      case "http_request_with_secrets":
        return this.httpRequestWithSecrets(input);
      case "ssh_with_secrets":
        return this.sshWithSecrets(input);
      case "intent_request":
        return this.intentRequest(input);
      case "revoke":
        return this.revoke(input);
      case "secret_profile_create":
        return this.secretProfileCreate(input);
      case "secret_profile_test":
        return this.secretProfileTest(input);
      case "recipe_save":
        return this.recipeSave(input);
      case "recipe_list":
        return { ok: true, data: { recipes: this.configDir ? new RecipeStore({ configDir: this.configDir }).list() : this.recipes } };
      case "ui_open":
        return { ok: true, data: { opened: false, mode: "metadata-only", message: "UI open is deferred to a later dashboard phase." } };
      case "audit_list":
        return { ok: true, data: { audits: this.audits } };
    }
  }

  private async execWithSecrets(input: Record<string, unknown>): Promise<McpToolResult> {
    const provider = requireString(input.provider, "provider");
    const args = requireStringArray(input.args, "args");
    const workspace = requireString(input.workspace, "workspace");
    const config = this.getConfig();
    const session = parseSession(input.session);

    const common = { workspace, config, secretStore: this.secretStore, args, session, runner: this.processRunner };
    const result = provider === "github"
      ? await runGitHubCli(common)
      : provider === "supabase"
        ? await runSupabaseCli(common)
        : provider === "vercel"
          ? await runVercelCli(common)
          : undefined;
    if (!result) {
      return errorResult("unsupported_provider", `Unsupported exec provider: ${provider}.`);
    }
    this.audits.push(result.audit);
    return { ok: result.executed, data: result, audit: result.audit };
  }

  private async httpRequestWithSecrets(input: Record<string, unknown>): Promise<McpToolResult> {
    const result = await runHttpRequest({
      workspace: requireString(input.workspace, "workspace"),
      config: this.getConfig(),
      adapters: this.adapters,
      secretStore: this.secretStore,
      provider: optionalString(input.provider),
      method: requireString(input.method, "method"),
      url: requireString(input.url, "url"),
      headers: optionalStringRecord(input.headers),
      secretTemplates: isRecord(input.secretTemplates) ? input.secretTemplates : undefined,
      runner: this.httpRunner,
      session: parseSession(input.session)
    });
    this.audits.push(result.audit);
    return { ok: result.executed, data: result, audit: result.audit };
  }

  private async sshWithSecrets(input: Record<string, unknown>): Promise<McpToolResult> {
    const mode = optionalString(input.mode) ?? "ssh-command";
    const common = {
      workspace: requireString(input.workspace, "workspace"),
      config: this.getConfig(),
      secretStore: this.secretStore,
      provider: optionalString(input.provider),
      knownHosts: isRecord(input.knownHosts) ? input.knownHosts as never : undefined,
      runner: this.processRunner,
      session: parseSession(input.session)
    };
    const result = mode === "git-ssh"
      ? await runGitSsh({
          ...common,
          remoteUrl: requireString(input.remoteUrl, "remoteUrl"),
          operation: requireString(input.operation, "operation"),
          gitArgs: optionalStringArray(input.gitArgs)
        })
      : await runSshCommand({
          ...common,
          host: requireString(input.host, "host"),
          user: optionalString(input.user),
          operation: optionalString(input.operation),
          command: optionalStringArray(input.command)
        });
    this.audits.push(result.audit);
    return { ok: result.executed, data: result, audit: result.audit };
  }

  private intentRequest(input: Record<string, unknown>): McpToolResult {
    const request: PendingIntentRequest = {
      id: `pending_${this.pendingIntents.length + 1}`,
      status: "pending",
      source: "mcp-request",
      scope: {
        workspace: requireString(input.workspace, "workspace"),
        provider: requireString(input.provider, "provider"),
        profile: requireString(input.profile, "profile"),
        environment: requireString(input.environment, "environment"),
        risk: normalizeRisk(requireString(input.risk, "risk"))
      },
      createdAt: new Date().toISOString()
    };
    this.pendingIntents.push(request);
    return { ok: true, data: { request, active: false, message: "MCP intent_request creates a pending request only." } };
  }

  private revoke(input: Record<string, unknown>): McpToolResult {
    if (!this.configDir) {
      return errorResult("config_dir_required", "revoke requires a configDir-backed MCP server.");
    }
    const result = new HumanIntentStore({ configDir: this.configDir }).revoke({
      id: requireString(input.id, "id"),
      yes: Boolean(input.yes)
    });
    this.audits.push(result.audit);
    return { ok: true, data: result.intent, audit: result.audit };
  }

  private secretProfileCreate(input: Record<string, unknown>): McpToolResult {
    if (containsSecretLikeInput(input)) {
      return errorResult("secret_value_rejected", "secret_profile_create accepts metadata only; do not pass secret values through MCP.");
    }
    const profile: ProfileMetadata = {
      id: requireString(input.profile, "profile"),
      provider: requireString(input.provider, "provider"),
      environment: optionalString(input.environment),
      displayName: optionalString(input.displayName),
      status: "draft",
      useCases: optionalStringArray(input.useCases),
      boundWorkspaces: input.workspace ? [requireString(input.workspace, "workspace")] : undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    return { ok: true, data: { profile, secretInput: "local-only" } };
  }

  private async secretProfileTest(input: Record<string, unknown>): Promise<McpToolResult> {
    if (!this.configDir) {
      return errorResult("config_dir_required", "secret_profile_test requires a configDir-backed MCP server.");
    }
    const inventory = new ProfileInventory({ configDir: this.configDir, store: this.secretStore });
    const result = await inventory.testProfile({
      profileId: requireString(input.profile, "profile"),
      field: optionalString(input.field)
    });
    return { ok: true, data: { profile: redactProfileMetadata(result.profile) } };
  }

  private recipeSave(input: Record<string, unknown>): McpToolResult {
    const binding = parseRecipeBinding(input.binding);
    if (this.configDir) {
      const recipe = new RecipeStore({ configDir: this.configDir }).save({
        id: requireString(input.id, "id"),
        binding,
        status: optionalRecipeStatus(input.status),
        riskRules: Array.isArray(input.riskRules) ? input.riskRules as never : undefined,
        validationSteps: Array.isArray(input.validationSteps) ? input.validationSteps as never : undefined,
        validationResults: Array.isArray(input.validationResults) ? input.validationResults as never : undefined
      });
      return { ok: true, data: { recipe } };
    }
    const status = optionalRecipeStatus(input.status) ?? "draft";
    const recipe: RecipeMetadata = {
      id: requireString(input.id, "id"),
      status,
      provider: binding.provider,
      profile: binding.profile,
      capability: binding.capability,
      workspace: binding.workspace,
      createdAt: new Date().toISOString()
    };
    this.recipes.push(recipe);
    return { ok: true, data: { recipe } };
  }

  private getConfig(): TokenValveConfig {
    if (this.explicitConfig) {
      return this.explicitConfig;
    }
    if (!this.configDir) {
      return { profiles: [], workspaces: [] };
    }
    const inventory = new ProfileInventory({ configDir: this.configDir, store: this.secretStore });
    return {
      profiles: inventory.listProfiles(),
      workspaces: inventory.getBindings()
    };
  }
}

function optionalRecipeStatus(value: unknown): RecipeStatus | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === "draft" || value === "verified" || value === "failed" || value === "stale" || value === "disabled") {
    return value;
  }
  throw new Error(`Unsupported recipe status: ${String(value)}.`);
}

export function getMcpServerStatus(): string {
  return "mcp server tools ready";
}

function toolDescription(name: McpToolName): string {
  return `TokenValve MCP tool: ${name}`;
}

function isToolName(name: string): name is McpToolName {
  return MCP_TOOL_NAMES.includes(name as McpToolName);
}

function errorResult(code: string, message: string): McpToolResult {
  return { ok: false, error: { code, message } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): never {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as never;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required.`);
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function requireStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`${label} must be a string array.`);
  }
  return value;
}

function optionalStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string") ? value : undefined;
}

function optionalStringRecord(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => typeof entry === "string")) as Record<string, string>;
}

function parseSession(value: unknown): AgentSessionContext | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return value as unknown as AgentSessionContext;
}

function hasShellString(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return Object.entries(value).some(([key, entry]) => {
    if (["shell", "commandLine", "cmdline"].includes(key)) {
      return true;
    }
    return isRecord(entry) ? hasShellString(entry) : false;
  });
}

function containsSecretLikeInput(value: Record<string, unknown>): boolean {
  return Object.keys(value).some((key) => /secret|token|apiKey|api_key|privateKey/i.test(key));
}

function redactProfileMetadata(profile: ProfileMetadata): ProfileMetadata {
  const safe = { ...profile };
  delete safe.secretLength;
  return safe;
}

function normalizeRisk(value: string): RiskLevel {
  if (value === "read" || value === "write" || value === "dangerous" || value === "production_deploy" || value === "unknown") {
    return value;
  }
  throw new Error(`Unsupported risk: ${value}`);
}

function parseRecipeBinding(value: unknown): RecipeBinding {
  const binding = requireRecordObject(value, "binding");
  return {
    workspace: requireString(binding.workspace, "binding.workspace"),
    provider: requireString(binding.provider, "binding.provider"),
    profile: requireString(binding.profile, "binding.profile"),
    environment: optionalString(binding.environment),
    capability: requireString(binding.capability, "binding.capability")
  };
}

function requireRecordObject(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}
