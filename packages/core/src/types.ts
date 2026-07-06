export type CapabilityType =
  | "cli-command"
  | "http-request"
  | "curl-template"
  | "ssh-command"
  | "git-ssh"
  | "script-command"
  | "llm-api-key";

export type RiskLevel = "read" | "write" | "dangerous" | "production_deploy" | "unknown";

export type Decision = "allow" | "blocked";

export type DecisionReason =
  | "allowed"
  | "workspace_not_configured"
  | "provider_not_configured"
  | "profile_not_configured"
  | "profile_not_verified"
  | "environment_not_configured"
  | "capability_not_configured"
  | "risk_unknown"
  | "human_intent_required";

export interface TokenValveConfig {
  workspaces: WorkspaceBinding[];
  profiles: ProfileMetadata[];
}

export interface WorkspaceBinding {
  path: string;
  providers: Record<string, ProviderBinding>;
}

export interface ProviderBinding {
  profile: string;
  environment?: string;
  capabilities?: Record<string, string>;
  clientProfiles?: Record<string, string>;
  capabilityProfiles?: Record<string, string>;
}

export interface AgentSessionContext {
  id: string;
  client?: string;
  providers?: Record<string, ProviderBinding>;
}

export interface ProfileMetadata {
  id: string;
  provider: string;
  environment?: string;
  displayName?: string;
  status?: "draft" | "unverified" | "verified" | "expired" | "disabled";
  useCases?: string[];
  maskedFingerprint?: string;
  secretLength?: number;
  boundWorkspaces?: string[];
  createdAt?: string;
  updatedAt?: string;
  lastVerifiedAt?: string;
  llm?: LlmProfileMetadata;
}

export interface LlmProfileMetadata {
  baseUrl?: string;
  organization?: string;
  project?: string;
  defaultModel?: string;
  clientLabels?: string[];
}

export interface AdapterDefinition {
  provider: string;
  capabilities: CapabilityDefinition[];
  riskRules: RiskRule[];
}

export type CapabilityDefinition =
  | CliCapabilityDefinition
  | HttpCapabilityDefinition
  | LlmCapabilityDefinition
  | HostOperationCapabilityDefinition
  | ScriptCapabilityDefinition;

export interface BaseCapabilityDefinition {
  id: string;
  type: CapabilityType;
}

export interface CliCapabilityDefinition extends BaseCapabilityDefinition {
  type: "cli-command" | "curl-template";
  commands: string[];
}

export interface HttpCapabilityDefinition extends BaseCapabilityDefinition {
  type: "http-request";
  allowedHosts: string[];
  pathPrefixes?: string[];
  methods?: string[];
}

export interface LlmCapabilityDefinition extends BaseCapabilityDefinition {
  type: "llm-api-key";
  provider: string;
  useCases?: string[];
}

export interface HostOperationCapabilityDefinition extends BaseCapabilityDefinition {
  type: "ssh-command" | "git-ssh";
  allowedHosts: string[];
  operations?: string[];
}

export interface ScriptCapabilityDefinition extends BaseCapabilityDefinition {
  type: "script-command";
  scripts: string[];
}

export interface RiskRule {
  capability?: string;
  risk: RiskLevel;
  match?: string[];
  method?: string;
  pathPrefix?: string;
  operation?: string;
  useCase?: string;
}

export type ExecutionContext =
  | CliExecutionContext
  | HttpExecutionContext
  | LlmExecutionContext
  | HostOperationExecutionContext
  | ScriptExecutionContext;

export interface BaseExecutionContext {
  provider?: string;
  capability?: CapabilityType;
}

export interface CliExecutionContext extends BaseExecutionContext {
  kind: "cli";
  command: string;
  args: string[];
}

export interface HttpExecutionContext extends BaseExecutionContext {
  kind: "http";
  method: string;
  url: string;
}

export interface LlmExecutionContext extends BaseExecutionContext {
  kind: "llm";
  provider: string;
  useCase?: string;
}

export interface HostOperationExecutionContext extends BaseExecutionContext {
  kind: "host-operation";
  type: "ssh-command" | "git-ssh";
  host: string;
  operation?: string;
}

export interface ScriptExecutionContext extends BaseExecutionContext {
  kind: "script";
  script: string;
}

export interface ResolveInput {
  workspace: string;
  config: TokenValveConfig | string;
  adapters: AdapterDefinition[] | string;
  execution: ExecutionContext;
  session?: AgentSessionContext;
}

export interface ResolveResult {
  decision: Decision;
  reason: DecisionReason;
  message: string;
  workspace?: string;
  provider?: string;
  profile?: string;
  environment?: string;
  capability?: string;
  capabilityType?: CapabilityType;
  risk?: RiskLevel;
  session?: {
    id: string;
    client?: string;
    usedOverride: boolean;
  };
}
