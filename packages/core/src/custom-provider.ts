import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";
import type {
  AdapterDefinition,
  CapabilityDefinition,
  HostOperationCapabilityDefinition,
  HttpCapabilityDefinition,
  LlmCapabilityDefinition,
  RiskRule,
  ScriptCapabilityDefinition
} from "./types.js";
import type { SecretTemplateMap } from "./http-runner.js";

export interface CustomProviderFiles {
  providers: CustomProviderMapping[];
}

export interface CustomProviderStoreOptions {
  configDir: string;
}

export interface CustomProviderMapping {
  provider: string;
  capabilities: CustomCapabilityMapping[];
}

export type CustomCapabilityMapping =
  | CustomHttpCapabilityMapping
  | CustomCurlCapabilityMapping
  | CustomScriptCapabilityMapping
  | CustomSshCapabilityMapping
  | CustomLlmCapabilityMapping;

export interface CustomCapabilityBase {
  id: string;
  riskRules: RiskRule[];
  validationSteps?: { id: string; description: string }[];
}

export interface CustomHttpCapabilityMapping extends CustomCapabilityBase {
  type: "http-request";
  allowedHosts: string[];
  pathPrefixes?: string[];
  methods?: string[];
  secretField?: string;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
}

export interface CustomCurlCapabilityMapping extends CustomCapabilityBase {
  type: "curl-template";
  commands: string[];
  allowedHosts: string[];
  pathPrefixes?: string[];
  methods?: string[];
  secretField?: string;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
}

export interface CustomScriptCapabilityMapping extends CustomCapabilityBase {
  type: "script-command";
  scripts: string[];
  secretField?: string;
  env?: Record<string, string>;
}

export interface CustomSshCapabilityMapping extends CustomCapabilityBase {
  type: "ssh-command" | "git-ssh";
  allowedHosts: string[];
  operations?: string[];
  secretField?: string;
  env?: Record<string, string>;
}

export interface CustomLlmCapabilityMapping extends CustomCapabilityBase {
  type: "llm-api-key";
  llmProvider: string;
  useCases?: string[];
  secretField?: string;
}

export interface SaveCustomHttpMappingInput {
  provider: string;
  capability: string;
  allowedHosts: string[];
  pathPrefixes?: string[];
  methods?: string[];
  riskRules?: RiskRule[];
  secretField?: string;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
}

export interface SaveCustomScriptMappingInput {
  provider: string;
  capability: string;
  scripts: string[];
  riskRules?: RiskRule[];
  secretField?: string;
  env?: Record<string, string>;
}

export class CustomProviderStore {
  private readonly configDir: string;

  public constructor(options: CustomProviderStoreOptions) {
    this.configDir = options.configDir;
  }

  public list(): CustomProviderMapping[] {
    return this.readFiles().providers;
  }

  public saveHttpMapping(input: SaveCustomHttpMappingInput): CustomCapabilityMapping {
    const mapping: CustomHttpCapabilityMapping = {
      id: requireNonEmpty(input.capability, "capability"),
      type: "http-request",
      allowedHosts: requireNonEmptyArray(input.allowedHosts, "allowedHosts"),
      pathPrefixes: input.pathPrefixes?.filter(Boolean),
      methods: input.methods?.map((method) => method.toUpperCase()),
      riskRules: input.riskRules ?? [],
      secretField: input.secretField,
      headers: input.headers,
      query: input.query,
      body: input.body
    };
    this.upsert(input.provider, mapping);
    return mapping;
  }

  public saveScriptMapping(input: SaveCustomScriptMappingInput): CustomCapabilityMapping {
    const mapping: CustomScriptCapabilityMapping = {
      id: requireNonEmpty(input.capability, "capability"),
      type: "script-command",
      scripts: requireNonEmptyArray(input.scripts, "scripts"),
      riskRules: input.riskRules ?? [],
      secretField: input.secretField,
      env: input.env
    };
    this.upsert(input.provider, mapping);
    return mapping;
  }

  private upsert(provider: string, capability: CustomCapabilityMapping): void {
    const providerName = requireNonEmpty(provider, "provider");
    assertNoPlainSecret(capability);
    const files = this.readFiles();
    const existing = files.providers.find((candidate) => candidate.provider === providerName);
    if (existing) {
      existing.capabilities = [
        ...existing.capabilities.filter((candidate) => candidate.id !== capability.id),
        capability
      ];
    } else {
      files.providers.push({ provider: providerName, capabilities: [capability] });
    }
    this.writeFiles(files);
  }

  private readFiles(): CustomProviderFiles {
    return readYaml(path.join(this.configDir, "custom-providers.yaml"), { providers: [] });
  }

  private writeFiles(files: CustomProviderFiles): void {
    mkdirSync(this.configDir, { recursive: true });
    writeFileSync(path.join(this.configDir, "custom-providers.yaml"), stringify(files), "utf8");
  }
}

export function customProvidersToAdapters(providers: CustomProviderMapping[]): AdapterDefinition[] {
  return providers.map((provider) => ({
    provider: provider.provider,
    capabilities: provider.capabilities.map(toCapabilityDefinition),
    riskRules: provider.capabilities.flatMap((capability) => capability.riskRules)
  }));
}

export function findCustomHttpTemplate(providers: CustomProviderMapping[], provider: string, capability: string): SecretTemplateMap | undefined {
  const mapping = findCapability(providers, provider, capability);
  if (!mapping || mapping.type !== "http-request" && mapping.type !== "curl-template") {
    return undefined;
  }
  return {
    field: mapping.secretField,
    headers: mapping.headers,
    query: mapping.query,
    body: mapping.body
  };
}

export function findCustomScriptTemplate(providers: CustomProviderMapping[], provider: string, capability: string): { field?: string; env?: Record<string, string> } | undefined {
  const mapping = findCapability(providers, provider, capability);
  if (!mapping || mapping.type !== "script-command") {
    return undefined;
  }
  return {
    field: mapping.secretField,
    env: mapping.env
  };
}

function toCapabilityDefinition(mapping: CustomCapabilityMapping): CapabilityDefinition {
  switch (mapping.type) {
    case "http-request":
      return {
        id: mapping.id,
        type: "http-request",
        allowedHosts: mapping.allowedHosts,
        pathPrefixes: mapping.pathPrefixes,
        methods: mapping.methods
      } satisfies HttpCapabilityDefinition;
    case "curl-template":
      return {
        id: mapping.id,
        type: "curl-template",
        commands: mapping.commands,
        allowedHosts: mapping.allowedHosts,
        pathPrefixes: mapping.pathPrefixes,
        methods: mapping.methods
      };
    case "script-command":
      return {
        id: mapping.id,
        type: "script-command",
        scripts: mapping.scripts
      } satisfies ScriptCapabilityDefinition;
    case "ssh-command":
    case "git-ssh":
      return {
        id: mapping.id,
        type: mapping.type,
        allowedHosts: mapping.allowedHosts,
        operations: mapping.operations
      } satisfies HostOperationCapabilityDefinition;
    case "llm-api-key":
      return {
        id: mapping.id,
        type: "llm-api-key",
        provider: mapping.llmProvider,
        useCases: mapping.useCases
      } satisfies LlmCapabilityDefinition;
  }
}

function findCapability(providers: CustomProviderMapping[], provider: string, capability: string): CustomCapabilityMapping | undefined {
  return providers
    .find((candidate) => candidate.provider === provider)
    ?.capabilities.find((candidate) => candidate.id === capability);
}

function assertNoPlainSecret(value: unknown): void {
  if (containsPlainSecret(value)) {
    throw new Error("Custom provider mapping must not contain plaintext secret values.");
  }
}

function containsPlainSecret(value: unknown): boolean {
  if (typeof value === "string") {
    return /(ghp_|gho_|github_pat_|sk-[a-z0-9_-]{16,}|Bearer\s+(?!\{\{token\}\})[a-z0-9._-]{16,}|BEGIN [A-Z ]*PRIVATE KEY|eyJ[a-z0-9_-]{20,})/i.test(value);
  }
  if (Array.isArray(value)) {
    return value.some(containsPlainSecret);
  }
  if (value && typeof value === "object") {
    return Object.values(value).some(containsPlainSecret);
  }
  return false;
}

function requireNonEmpty(value: string, label: string): string {
  if (!value.trim()) {
    throw new Error(`${label} is required.`);
  }
  return value;
}

function requireNonEmptyArray(value: string[], label: string): string[] {
  const filtered = value.filter((entry) => entry.trim());
  if (filtered.length === 0) {
    throw new Error(`${label} must include at least one value.`);
  }
  return filtered;
}

function readYaml<T>(filePath: string, fallback: T): T {
  if (!existsSync(filePath)) {
    return fallback;
  }
  return parse(readFileSync(filePath, "utf8")) as T;
}
