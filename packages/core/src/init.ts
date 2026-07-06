import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { stringify, parse } from "yaml";
import { canonicalizeWorkspace, resolveContext } from "./resolver.js";
import type { AdapterDefinition, ProfileMetadata, TokenValveConfig, WorkspaceBinding } from "./types.js";

export type SupportedInitProvider = "github" | "supabase" | "vercel";

export interface InitOptions {
  workspace: string;
  configDir: string;
  providers: SupportedInitProvider[];
  addProviders?: SupportedInitProvider[];
  llmKeys?: string[];
  yes: boolean;
  dryRun?: boolean;
  cliAvailability?: Record<string, boolean>;
}

export interface DetectedWorkspaceContext {
  workspace: string;
  gitRemote?: string;
  hasSupabaseConfig: boolean;
  hasVercelConfig: boolean;
  cliAvailability: Record<string, boolean>;
}

export interface GeneratedInitFiles {
  config: InitConfigFile;
  profiles: InitProfilesFile;
  bindings: InitBindingsFile;
  policies: InitPoliciesFile;
}

export interface InitConfigFile {
  version: 1;
  workspace: string;
  selectedProviders: string[];
  generatedAt: string;
  detections: DetectedWorkspaceContext;
}

export interface InitProfilesFile {
  profiles: ProfileMetadata[];
}

export interface InitBindingsFile {
  workspaces: WorkspaceBinding[];
}

export interface InitPoliciesFile {
  policies: Record<string, unknown>;
}

export interface DryRunMatrixRow {
  label: string;
  provider: string;
  profile?: string;
  environment?: string;
  decision: string;
  reason: string;
  risk?: string;
}

export interface InitResult {
  detections: DetectedWorkspaceContext;
  files: GeneratedInitFiles;
  dryRunMatrix: DryRunMatrixRow[];
  writtenFiles: string[];
}

const BUILTIN_ADAPTERS: AdapterDefinition[] = [
  {
    provider: "github",
    capabilities: [{ id: "github-cli", type: "cli-command", commands: ["gh"] }],
    riskRules: [
      { capability: "github-cli", match: ["repo", "view"], risk: "read" },
      { capability: "github-cli", match: ["repo", "delete"], risk: "dangerous" }
    ]
  },
  {
    provider: "supabase",
    capabilities: [{ id: "supabase-cli", type: "cli-command", commands: ["supabase"] }],
    riskRules: [
      { capability: "supabase-cli", match: ["projects", "list"], risk: "read" },
      { capability: "supabase-cli", match: ["db", "push"], risk: "write" }
    ]
  },
  {
    provider: "vercel",
    capabilities: [{ id: "vercel-cli", type: "cli-command", commands: ["vercel"] }],
    riskRules: [
      { capability: "vercel-cli", match: ["deploy"], risk: "write" },
      { capability: "vercel-cli", match: ["deploy", "--prod"], risk: "production_deploy" }
    ]
  },
  {
    provider: "openai",
    capabilities: [{ id: "openai-default", type: "llm-api-key", provider: "openai", useCases: ["code-generation"] }],
    riskRules: [{ capability: "openai-default", useCase: "code-generation", risk: "read" }]
  }
];

export function runScenarioInit(options: InitOptions): InitResult {
  if (!options.yes) {
    throw new Error("TokenValve init requires --yes in non-interactive Phase 6 mode.");
  }

  if (!existsSync(options.workspace)) {
    throw new Error(`Workspace does not exist: ${options.workspace}`);
  }

  const workspace = canonicalizeWorkspace(options.workspace);
  const selectedProviders = mergeProviders(options.providers, options.addProviders ?? []);
  const detections = detectWorkspaceContext(workspace, options.cliAvailability);
  const existing = loadExistingInitFiles(options.configDir);
  const files = generateInitFiles({
    workspace,
    selectedProviders,
    llmKeys: options.llmKeys ?? [],
    detections,
    existing
  });
  const dryRunMatrix = createDryRunMatrix(workspace, files);
  const writtenFiles = options.dryRun ? [] : writeInitFiles(options.configDir, files);

  return { detections, files, dryRunMatrix, writtenFiles };
}

export function detectWorkspaceContext(
  workspace: string,
  cliAvailability: Record<string, boolean> = {}
): DetectedWorkspaceContext {
  return {
    workspace,
    gitRemote: detectGitRemote(workspace),
    hasSupabaseConfig: existsSync(path.join(workspace, "supabase", "config.toml")),
    hasVercelConfig: existsSync(path.join(workspace, ".vercel", "project.json")),
    cliAvailability
  };
}

function generateInitFiles(input: {
  workspace: string;
  selectedProviders: SupportedInitProvider[];
  llmKeys: string[];
  detections: DetectedWorkspaceContext;
  existing?: GeneratedInitFiles;
}): GeneratedInitFiles {
  const profiles = new Map<string, ProfileMetadata>();
  for (const profile of input.existing?.profiles.profiles ?? []) {
    profiles.set(profile.id, profile);
  }

  const providerBindings: WorkspaceBinding["providers"] = {
    ...(input.existing?.bindings.workspaces.find((binding) => canonicalizeWorkspace(binding.path) === input.workspace)?.providers ?? {})
  };

  for (const provider of input.selectedProviders) {
    const profile = defaultProfileForProvider(provider);
    profiles.set(profile.id, profile);
    providerBindings[provider] = {
      profile: profile.id,
      environment: profile.environment,
      capabilities: provider === "github" ? { "cli-command": "github-cli" } : undefined
    };
  }

  for (const llmKey of input.llmKeys) {
    const [provider] = llmKey.split(":");
    if (!provider) {
      continue;
    }
    profiles.set(llmKey, {
      id: llmKey,
      provider,
      displayName: llmKey,
      status: "unverified"
    });
    providerBindings[provider] = {
      profile: llmKey,
      capabilities: { "llm-api-key": `${provider}-default` }
    };
  }

  return {
    config: {
      version: 1,
      workspace: input.workspace,
      selectedProviders: [
        ...new Set([
          ...input.selectedProviders,
          ...input.llmKeys.map((key) => key.split(":")[0]).filter(isString)
        ])
      ],
      generatedAt: new Date().toISOString(),
      detections: input.detections
    },
    profiles: {
      profiles: [...profiles.values()]
    },
    bindings: {
      workspaces: [{ path: input.workspace, providers: providerBindings }]
    },
    policies: {
      policies: {
        productionWrites: "require-human-intent",
        unconfiguredProviders: "fail-closed"
      }
    }
  };
}

function createDryRunMatrix(workspace: string, files: GeneratedInitFiles): DryRunMatrixRow[] {
  const config: TokenValveConfig = {
    workspaces: files.bindings.workspaces,
    profiles: files.profiles.profiles
  };

  const scenarios = [
    { label: "GitHub repo view", provider: "github", execution: { kind: "cli" as const, command: "gh", args: ["repo", "view"] } },
    { label: "Supabase projects list", provider: "supabase", execution: { kind: "cli" as const, command: "supabase", args: ["projects", "list"] } },
    { label: "Supabase db push", provider: "supabase", execution: { kind: "cli" as const, command: "supabase", args: ["db", "push"] } },
    { label: "Vercel deploy --prod", provider: "vercel", execution: { kind: "cli" as const, command: "vercel", args: ["deploy", "--prod"] } },
    { label: "OpenAI code generation", provider: "openai", execution: { kind: "llm" as const, provider: "openai", useCase: "code-generation" } }
  ];

  return scenarios.map((scenario) => {
    const result = resolveContext({
      workspace,
      config,
      adapters: BUILTIN_ADAPTERS,
      execution: scenario.execution
    });
    return {
      label: scenario.label,
      provider: scenario.provider,
      profile: result.profile,
      environment: result.environment,
      decision: result.decision,
      reason: result.reason,
      risk: result.risk
    };
  });
}

function writeInitFiles(configDir: string, files: GeneratedInitFiles): string[] {
  mkdirSync(configDir, { recursive: true });
  const entries = [
    ["config.yaml", files.config],
    ["profiles.yaml", files.profiles],
    ["bindings.yaml", files.bindings],
    ["policies.yaml", files.policies]
  ] as const;

  return entries.map(([fileName, content]) => {
    const filePath = path.join(configDir, fileName);
    writeFileSync(filePath, stringify(content), "utf8");
    return filePath;
  });
}

function loadExistingInitFiles(configDir: string): GeneratedInitFiles | undefined {
  const filePaths = {
    config: path.join(configDir, "config.yaml"),
    profiles: path.join(configDir, "profiles.yaml"),
    bindings: path.join(configDir, "bindings.yaml"),
    policies: path.join(configDir, "policies.yaml")
  };

  if (!Object.values(filePaths).every((filePath) => existsSync(filePath))) {
    return undefined;
  }

  return {
    config: parse(readFileSync(filePaths.config, "utf8")) as InitConfigFile,
    profiles: parse(readFileSync(filePaths.profiles, "utf8")) as InitProfilesFile,
    bindings: parse(readFileSync(filePaths.bindings, "utf8")) as InitBindingsFile,
    policies: parse(readFileSync(filePaths.policies, "utf8")) as InitPoliciesFile
  };
}

function defaultProfileForProvider(provider: SupportedInitProvider): ProfileMetadata {
  switch (provider) {
    case "github":
      return { id: "github:default", provider: "github", environment: "development", displayName: "GitHub Default", status: "unverified" };
    case "supabase":
      return { id: "supabase:default:staging", provider: "supabase", environment: "staging", displayName: "Supabase Staging", status: "unverified" };
    case "vercel":
      return { id: "vercel:default", provider: "vercel", environment: "production", displayName: "Vercel Default", status: "unverified" };
  }
}

function mergeProviders(providers: SupportedInitProvider[], addProviders: SupportedInitProvider[]): SupportedInitProvider[] {
  return [...new Set([...providers, ...addProviders])];
}

function detectGitRemote(workspace: string): string | undefined {
  const configPath = path.join(workspace, ".git", "config");
  if (!existsSync(configPath)) {
    return undefined;
  }
  const match = readFileSync(configPath, "utf8").match(/url\s*=\s*(.+)/);
  return match?.[1]?.trim();
}

function isString(value: string | undefined): value is string {
  return Boolean(value);
}
