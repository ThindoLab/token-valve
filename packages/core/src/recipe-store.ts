import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";
import type { RiskLevel, RiskRule, TokenValveConfig } from "./types.js";

export type RecipeStatus = "draft" | "verified" | "failed" | "stale" | "disabled";

export interface RecipeBinding {
  workspace: string;
  provider: string;
  profile: string;
  environment?: string;
  capability: string;
}

export interface RecipeValidationStep {
  id: string;
  description: string;
  command?: string[];
}

export interface RecipeValidationResult {
  status: "passed" | "failed";
  checkedAt: string;
  message: string;
}

export interface TokenValveRecipe {
  id: string;
  status: RecipeStatus;
  binding: RecipeBinding;
  riskRules: RiskRule[];
  validationSteps: RecipeValidationStep[];
  validationResults?: RecipeValidationResult[];
  createdAt: string;
  updatedAt: string;
  lastVerifiedAt?: string;
}

export interface RecipeFiles {
  recipes: TokenValveRecipe[];
}

export interface RecipeStoreOptions {
  configDir: string;
  now?: () => Date;
}

export interface SaveRecipeInput {
  id: string;
  binding: RecipeBinding;
  riskRules?: RiskRule[];
  validationSteps?: RecipeValidationStep[];
  status?: RecipeStatus;
}

export class RecipeStore {
  private readonly configDir: string;
  private readonly now: () => Date;

  public constructor(options: RecipeStoreOptions) {
    this.configDir = options.configDir;
    this.now = options.now ?? (() => new Date());
  }

  public list(): TokenValveRecipe[] {
    return this.readFiles().recipes;
  }

  public show(id: string): TokenValveRecipe {
    return findRecipeOrThrow(this.readFiles(), id);
  }

  public save(input: SaveRecipeInput): TokenValveRecipe {
    assertNoSecretLikeValue(input);
    const files = this.readFiles();
    const existing = files.recipes.find((recipe) => recipe.id === input.id);
    const now = this.now().toISOString();
    const recipe: TokenValveRecipe = {
      ...existing,
      id: input.id,
      status: input.status ?? existing?.status ?? "draft",
      binding: {
        ...input.binding,
        workspace: canonicalizeWorkspace(input.binding.workspace)
      },
      riskRules: input.riskRules ?? existing?.riskRules ?? [],
      validationSteps: input.validationSteps ?? existing?.validationSteps ?? [],
      validationResults: existing?.validationResults,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      lastVerifiedAt: existing?.lastVerifiedAt
    };
    upsertRecipe(files, recipe);
    this.writeFiles(files);
    return recipe;
  }

  public test(id: string, config: TokenValveConfig): TokenValveRecipe {
    const files = this.readFiles();
    const existing = findRecipeOrThrow(files, id);
    const now = this.now().toISOString();
    const passed = recipeMatchesConfig(existing, config);
    const nextStatus: RecipeStatus = passed ? "verified" : existing.status === "verified" ? "stale" : "failed";
    const recipe: TokenValveRecipe = {
      ...existing,
      status: nextStatus,
      updatedAt: now,
      lastVerifiedAt: passed ? now : existing.lastVerifiedAt,
      validationResults: [{
        status: passed ? "passed" : "failed",
        checkedAt: now,
        message: passed ? "Recipe metadata matches configured workspace and profile." : "Recipe metadata no longer matches configured workspace or profile."
      }]
    };
    upsertRecipe(files, recipe);
    this.writeFiles(files);
    return recipe;
  }

  public findVerified(workspace: string, capability: string): TokenValveRecipe | undefined {
    const targetWorkspace = canonicalizeWorkspace(workspace);
    return this.list().find((recipe) =>
      recipe.status === "verified"
      && recipe.binding.workspace === targetWorkspace
      && recipe.binding.capability === capability
    );
  }

  private readFiles(): RecipeFiles {
    return readYaml(path.join(this.configDir, "recipes.yaml"), { recipes: [] });
  }

  private writeFiles(files: RecipeFiles): void {
    mkdirSync(this.configDir, { recursive: true });
    writeFileSync(path.join(this.configDir, "recipes.yaml"), stringify(files), "utf8");
  }
}

export function assertNoSecretLikeValue(value: unknown): void {
  if (containsSecretLikeValue(value)) {
    throw new Error("Recipe must not contain secret-like fields or values.");
  }
}

function containsSecretLikeValue(value: unknown): boolean {
  if (typeof value === "string") {
    return /(ghp_|gho_|sk-|secret|api[_-]?key|private[_-]?key|token=)/i.test(value);
  }
  if (Array.isArray(value)) {
    return value.some(containsSecretLikeValue);
  }
  if (value && typeof value === "object") {
    return Object.entries(value).some(([key, entry]) => /secret|token|apiKey|api_key|privateKey|private_key/i.test(key) || containsSecretLikeValue(entry));
  }
  return false;
}

function recipeMatchesConfig(recipe: TokenValveRecipe, config: TokenValveConfig): boolean {
  const workspace = config.workspaces.find((binding) => canonicalizeWorkspace(binding.path) === recipe.binding.workspace);
  const profile = config.profiles.find((candidate) => candidate.id === recipe.binding.profile && candidate.provider === recipe.binding.provider);
  return Boolean(workspace?.providers[recipe.binding.provider]?.profile === recipe.binding.profile && profile);
}

function findRecipeOrThrow(files: RecipeFiles, id: string): TokenValveRecipe {
  const recipe = files.recipes.find((candidate) => candidate.id === id);
  if (!recipe) {
    throw new Error(`Recipe does not exist: ${id}.`);
  }
  return recipe;
}

function upsertRecipe(files: RecipeFiles, recipe: TokenValveRecipe): void {
  const index = files.recipes.findIndex((candidate) => candidate.id === recipe.id);
  if (index >= 0) {
    files.recipes[index] = recipe;
  } else {
    files.recipes.push(recipe);
  }
}

function readYaml<T>(filePath: string, fallback: T): T {
  if (!existsSync(filePath)) {
    return fallback;
  }
  return parse(readFileSync(filePath, "utf8")) as T;
}

function canonicalizeWorkspace(workspace: string): string {
  const resolved = path.resolve(workspace);
  if (!existsSync(resolved)) {
    return stripTrailingSeparator(resolved);
  }
  return stripTrailingSeparator(realpathSync.native(resolved));
}

function stripTrailingSeparator(value: string): string {
  return value.length > 1 ? value.replace(/[\\/]+$/, "") : value;
}

export function riskRule(capability: string, risk: RiskLevel): RiskRule {
  return { capability, risk };
}
