import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";
import { canonicalizeWorkspace } from "./resolver.js";
import { createSecretRef, type SecretRef, type SecretStore } from "./secret-store.js";
import type { ProfileMetadata, WorkspaceBinding } from "./types.js";

export type ProfileStatus = NonNullable<ProfileMetadata["status"]>;

export interface ProfileInventoryFiles {
  profiles: { profiles: ProfileMetadata[] };
  bindings: { workspaces: WorkspaceBinding[] };
}

export interface ProfileInventoryOptions {
  configDir: string;
  store: SecretStore;
}

export interface AddSecretProfileInput {
  profileId: string;
  provider: string;
  environment?: string;
  displayName?: string;
  useCases?: string[];
  workspace?: string;
  secretValue: string;
  field?: string;
  replace?: boolean;
  yes: boolean;
}

export interface UpdateSecretProfileInput {
  profileId: string;
  provider?: string;
  environment?: string;
  displayName?: string;
  useCases?: string[];
  status?: ProfileStatus;
  secretValue?: string;
  field?: string;
  yes: boolean;
}

export interface DeleteSecretProfileInput {
  profileId: string;
  field?: string;
  yes: boolean;
}

export interface TestSecretProfileInput {
  profileId: string;
  field?: string;
}

export interface SecretProfileResult {
  profile: ProfileMetadata;
  secretRef: SecretRef;
}

const PROFILE_STATUSES: ProfileStatus[] = ["draft", "unverified", "verified", "expired", "disabled"];
const DEFAULT_SECRET_FIELD = "token";

export class ProfileInventory {
  private readonly configDir: string;
  private readonly store: SecretStore;

  public constructor(options: ProfileInventoryOptions) {
    this.configDir = options.configDir;
    this.store = options.store;
  }

  public listProfiles(): ProfileMetadata[] {
    return this.readFiles().profiles.profiles;
  }

  public async addProfile(input: AddSecretProfileInput): Promise<SecretProfileResult> {
    requireYes(input.yes, "add");
    assertNonEmpty(input.profileId, "profile id");
    assertNonEmpty(input.provider, "provider");
    assertSecretValue(input.secretValue);

    const files = this.readFiles();
    const existingIndex = files.profiles.profiles.findIndex((profile) => profile.id === input.profileId);
    if (existingIndex >= 0 && !input.replace) {
      throw new Error(`Profile already exists: ${input.profileId}. Use --replace to overwrite it.`);
    }

    const now = new Date().toISOString();
    const existing = existingIndex >= 0 ? files.profiles.profiles[existingIndex] : undefined;
    const ref = createSecretRef(getStoreName(this.store), input.profileId, input.field ?? DEFAULT_SECRET_FIELD);
    const fingerprint = createMaskedFingerprint(input.secretValue);
    const workspace = input.workspace ? canonicalizeWorkspace(input.workspace) : undefined;
    const boundWorkspaces = mergeBoundWorkspaces(existing?.boundWorkspaces, workspace);
    const profile: ProfileMetadata = {
      ...existing,
      id: input.profileId,
      provider: input.provider,
      environment: input.environment ?? existing?.environment,
      displayName: input.displayName ?? existing?.displayName,
      status: "unverified",
      useCases: input.useCases ?? existing?.useCases,
      maskedFingerprint: fingerprint.masked,
      secretLength: fingerprint.length,
      boundWorkspaces,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      lastVerifiedAt: undefined
    };

    await this.store.writeSecret({
      profileId: input.profileId,
      field: ref.field,
      value: input.secretValue,
      metadata: {
        provider: profile.provider,
        environment: profile.environment,
        displayName: profile.displayName
      }
    });

    upsertProfile(files, profile);
    if (workspace) {
      bindWorkspace(files, workspace, profile.provider, profile.id, profile.environment);
    }
    this.writeFiles(files);
    return { profile, secretRef: ref };
  }

  public async updateProfile(input: UpdateSecretProfileInput): Promise<SecretProfileResult> {
    requireYes(input.yes, "update");
    const files = this.readFiles();
    const existing = findProfileOrThrow(files, input.profileId);
    const now = new Date().toISOString();
    let ref = createSecretRef(getStoreName(this.store), existing.id, input.field ?? DEFAULT_SECRET_FIELD);
    let maskedFingerprint = existing.maskedFingerprint;
    let secretLength = existing.secretLength;
    let status = input.status ?? existing.status ?? "unverified";
    let lastVerifiedAt = existing.lastVerifiedAt;

    if (input.status) {
      assertStatus(input.status);
    }

    if (input.secretValue !== undefined) {
      assertSecretValue(input.secretValue);
      const fingerprint = createMaskedFingerprint(input.secretValue);
      maskedFingerprint = fingerprint.masked;
      secretLength = fingerprint.length;
      ref = await this.store.updateSecret(ref, input.secretValue, {
        provider: input.provider ?? existing.provider,
        environment: input.environment ?? existing.environment,
        displayName: input.displayName ?? existing.displayName
      });
      if (!input.status) {
        status = "unverified";
        lastVerifiedAt = undefined;
      }
    }

    const profile: ProfileMetadata = {
      ...existing,
      provider: input.provider ?? existing.provider,
      environment: input.environment ?? existing.environment,
      displayName: input.displayName ?? existing.displayName,
      useCases: input.useCases ?? existing.useCases,
      status,
      maskedFingerprint,
      secretLength,
      lastVerifiedAt,
      updatedAt: now
    };

    upsertProfile(files, profile);
    updateBindingsForProfile(files, existing, profile);
    this.writeFiles(files);
    return { profile, secretRef: ref };
  }

  public async deleteProfile(input: DeleteSecretProfileInput): Promise<ProfileMetadata> {
    requireYes(input.yes, "delete");
    const files = this.readFiles();
    const existing = findProfileOrThrow(files, input.profileId);
    const ref = createSecretRef(getStoreName(this.store), existing.id, input.field ?? DEFAULT_SECRET_FIELD);
    await this.store.deleteSecret(ref);
    files.profiles.profiles = files.profiles.profiles.filter((profile) => profile.id !== existing.id);
    removeBindingsForProfile(files, existing.id);
    this.writeFiles(files);
    return existing;
  }

  public async testProfile(input: TestSecretProfileInput): Promise<SecretProfileResult> {
    const files = this.readFiles();
    const existing = findProfileOrThrow(files, input.profileId);
    const ref = createSecretRef(getStoreName(this.store), existing.id, input.field ?? DEFAULT_SECRET_FIELD);
    const value = await this.store.readSecret(ref);
    if (!value) {
      throw new Error(`Secret value is missing for profile: ${existing.id}.`);
    }

    const now = new Date().toISOString();
    const fingerprint = createMaskedFingerprint(value);
    const profile: ProfileMetadata = {
      ...existing,
      status: "verified",
      maskedFingerprint: fingerprint.masked,
      secretLength: fingerprint.length,
      lastVerifiedAt: now,
      updatedAt: now
    };
    upsertProfile(files, profile);
    this.writeFiles(files);
    return { profile, secretRef: ref };
  }

  private readFiles(): ProfileInventoryFiles {
    return {
      profiles: readYaml(path.join(this.configDir, "profiles.yaml"), { profiles: [] }),
      bindings: readYaml(path.join(this.configDir, "bindings.yaml"), { workspaces: [] })
    };
  }

  private writeFiles(files: ProfileInventoryFiles): void {
    mkdirSync(this.configDir, { recursive: true });
    writeFileSync(path.join(this.configDir, "profiles.yaml"), stringify(files.profiles), "utf8");
    writeFileSync(path.join(this.configDir, "bindings.yaml"), stringify(files.bindings), "utf8");
  }
}

export function createMaskedFingerprint(secretValue: string): { masked: string; length: number } {
  const hash = createHash("sha256").update(secretValue).digest("hex").slice(0, 12);
  return {
    masked: `sha256:${hash}`,
    length: secretValue.length
  };
}

function readYaml<T>(filePath: string, fallback: T): T {
  if (!existsSync(filePath)) {
    return fallback;
  }
  return parse(readFileSync(filePath, "utf8")) as T;
}

function requireYes(yes: boolean, action: string): void {
  if (!yes) {
    throw new Error(`TokenValve secret ${action} requires --yes in non-interactive mode.`);
  }
}

function assertNonEmpty(value: string | undefined, label: string): void {
  if (!value?.trim()) {
    throw new Error(`${label} is required.`);
  }
}

function assertSecretValue(value: string): void {
  if (!value.trim()) {
    throw new Error("secret value is required and cannot be empty.");
  }
}

function assertStatus(status: ProfileStatus): void {
  if (!PROFILE_STATUSES.includes(status)) {
    throw new Error(`Unsupported profile status: ${status}.`);
  }
}

function findProfileOrThrow(files: ProfileInventoryFiles, profileId: string): ProfileMetadata {
  const profile = files.profiles.profiles.find((candidate) => candidate.id === profileId);
  if (!profile) {
    throw new Error(`Profile does not exist: ${profileId}.`);
  }
  return profile;
}

function upsertProfile(files: ProfileInventoryFiles, profile: ProfileMetadata): void {
  const index = files.profiles.profiles.findIndex((candidate) => candidate.id === profile.id);
  if (index >= 0) {
    files.profiles.profiles[index] = profile;
  } else {
    files.profiles.profiles.push(profile);
  }
}

function bindWorkspace(files: ProfileInventoryFiles, workspace: string, provider: string, profileId: string, environment?: string): void {
  const existing = files.bindings.workspaces.find((binding) => canonicalizeWorkspace(binding.path) === workspace);
  const binding = existing ?? { path: workspace, providers: {} };
  binding.providers[provider] = { profile: profileId, environment };
  if (!existing) {
    files.bindings.workspaces.push(binding);
  }
}

function updateBindingsForProfile(files: ProfileInventoryFiles, previous: ProfileMetadata, next: ProfileMetadata): void {
  for (const workspace of files.bindings.workspaces) {
    for (const [provider, binding] of Object.entries(workspace.providers)) {
      if (binding.profile === previous.id) {
        if (provider !== next.provider) {
          delete workspace.providers[provider];
          workspace.providers[next.provider] = { profile: next.id, environment: next.environment };
        } else {
          binding.environment = next.environment;
        }
      }
    }
  }
}

function removeBindingsForProfile(files: ProfileInventoryFiles, profileId: string): void {
  for (const workspace of files.bindings.workspaces) {
    for (const [provider, binding] of Object.entries(workspace.providers)) {
      if (binding.profile === profileId) {
        delete workspace.providers[provider];
      }
    }
  }
}

function mergeBoundWorkspaces(existing: string[] | undefined, workspace: string | undefined): string[] | undefined {
  if (!workspace) {
    return existing;
  }
  return [...new Set([...(existing ?? []), workspace])];
}

function getStoreName(store: SecretStore): string {
  return "store" in store && typeof store.store === "string" ? store.store : "secret-store";
}
