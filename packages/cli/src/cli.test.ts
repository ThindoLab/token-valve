import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CommanderError } from "commander";
import {
  MemorySecretStore,
  RecipeStore,
  type HttpRunInput,
  type HttpRunner,
  type ProcessRunInput,
  type ProcessRunner
} from "@tokenvalve/core";
import { createCli } from "./cli.js";

class FakeProcessRunner implements ProcessRunner {
  public readonly calls: ProcessRunInput[] = [];

  public async run(input: ProcessRunInput) {
    this.calls.push(input);
    const token = input.env.GH_TOKEN
      ?? input.env.SUPABASE_ACCESS_TOKEN
      ?? input.env.VERCEL_TOKEN
      ?? input.env.SSH_AUTH_SOCK
      ?? input.env.GIT_SSH_COMMAND
      ?? input.env.INTERNAL_TOKEN
      ?? "";
    return {
      stdout: `ok ${token || input.args.join(" ")}`,
      stderr: "",
      exitCode: 0
    };
  }
}

class FakeHttpRunner implements HttpRunner {
  public readonly calls: HttpRunInput[] = [];

  public async run(input: HttpRunInput) {
    this.calls.push(input);
    return {
      status: 200,
      body: `ok ${input.headers.Authorization ?? ""} ${input.body ?? ""}`
    };
  }
}

async function runCli(
  args: string[],
  options: { secretStore?: MemorySecretStore; processRunner?: ProcessRunner; httpRunner?: HttpRunner } = {}
): Promise<string> {
  const output: string[] = [];
  const program = createCli({
    writeOut: (value) => output.push(value),
    secretStore: options.secretStore,
    processRunner: options.processRunner,
    httpRunner: options.httpRunner
  });

  program.exitOverride();
  program.configureOutput({
    writeOut: (value) => output.push(value),
    writeErr: (value) => output.push(value)
  });

  try {
    await program.parseAsync(["node", "tokenvalve", ...args]);
  } catch (error) {
    if (!(error instanceof CommanderError) || error.exitCode !== 0) {
      if (!(error instanceof Error) || !error.message.includes('process.exit unexpectedly called with "0"')) {
        throw error;
      }
    }
  }

  return output.join("");
}

describe("tokenvalve cli", () => {
  it("prints the package version", async () => {
    await expect(runCli(["--version"])).resolves.toMatch(/0\.1\.0/);
  });

  it("runs doctor diagnostics with actionable next steps", async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), "tokenvalve-cli-doctor-empty-"));
    const configDir = path.join(workspace, ".tokenvalve");
    const output = await runCli([
      "doctor",
      "--workspace",
      workspace,
      "--config-dir",
      configDir,
      "--path",
      ""
    ]);

    expect(output).toContain("TokenValve doctor");
    expect(output).toContain("status: warning");
    expect(output).toContain("config.missing");
    expect(output).toContain("next:");
  });

  it("redacts secret-like values from doctor output", async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), "tokenvalve-cli-doctor-secret-"));
    const configDir = path.join(workspace, ".tokenvalve");
    const token = "ghp_cli_doctor_secret_value_1234567890";
    await runCli([
      "init",
      "--workspace",
      workspace,
      "--config-dir",
      configDir,
      "--provider",
      "github",
      "--yes"
    ]);
    writeFileSync(path.join(configDir, "profiles.yaml"), `profiles:\n  - id: github:bad\n    provider: github\n    note: ${token}\n`, "utf8");

    const output = await runCli([
      "doctor",
      "--workspace",
      workspace,
      "--config-dir",
      configDir,
      "--path",
      path.join(configDir, "bin")
    ]);

    expect(output).toContain("config.plaintext_secret.profiles.yaml");
    expect(output).toContain("[REDACTED]");
    expect(output).not.toContain(token);
  });

  it("runs scenario init and writes workspace config", async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), "tokenvalve-cli-init-"));
    const configDir = path.join(workspace, ".tokenvalve");

    const output = await runCli([
      "init",
      "--workspace",
      workspace,
      "--config-dir",
      configDir,
      "--provider",
      "github",
      "--llm-key",
      "openai:work",
      "--yes"
    ]);

    expect(output).toContain("TokenValve init");
    expect(output).toContain("Dry-run matrix:");
    expect(output).toContain("OpenAI code generation: allow");
    expect(existsSync(path.join(configDir, "config.yaml"))).toBe(true);
    expect(existsSync(path.join(configDir, "profiles.yaml"))).toBe(true);
    expect(existsSync(path.join(configDir, "bindings.yaml"))).toBe(true);
    expect(existsSync(path.join(configDir, "policies.yaml"))).toBe(true);
  });

  it("runs scenario init dry-run without writing config", async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), "tokenvalve-cli-init-dry-"));
    const configDir = path.join(workspace, ".tokenvalve");

    const output = await runCli([
      "init",
      "--workspace",
      workspace,
      "--config-dir",
      configDir,
      "--provider",
      "github",
      "--dry-run",
      "--yes"
    ]);

    expect(output).toContain("dry-run: no files written");
    expect(output).toContain("GitHub repo view: allow");
    expect(existsSync(configDir)).toBe(false);
  });

  it("shows a redacted dashboard and safely switches default profile", async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), "tokenvalve-cli-dashboard-"));
    const configDir = path.join(workspace, ".tokenvalve");
    const store = new MemorySecretStore();
    const token = "ghp_dashboard_secret_value_1234567890";

    await runCli([
      "secret",
      "add",
      "--config-dir",
      configDir,
      "--workspace",
      workspace,
      "--profile",
      "github:work",
      "--provider",
      "github",
      "--environment",
      "development",
      "--secret-value",
      token,
      "--yes"
    ], { secretStore: store });
    await runCli([
      "secret",
      "add",
      "--config-dir",
      configDir,
      "--profile",
      "github:client",
      "--provider",
      "github",
      "--environment",
      "development",
      "--secret-value",
      "ghp_dashboard_client_value_1234567890",
      "--yes"
    ], { secretStore: store });

    const before = await runCli([
      "dashboard",
      "--workspace",
      workspace,
      "--config-dir",
      configDir
    ], { secretStore: store });
    const switched = await runCli([
      "dashboard",
      "use",
      "--workspace",
      workspace,
      "--config-dir",
      configDir,
      "--provider",
      "github",
      "--profile",
      "github:client",
      "--yes"
    ], { secretStore: store });
    const after = await runCli([
      "dashboard",
      "--workspace",
      workspace,
      "--config-dir",
      configDir
    ], { secretStore: store });

    expect(before).toContain("TokenValve dashboard");
    expect(before).toContain("github -> github:work");
    expect(before).toContain("status=unverified");
    expect(before).not.toContain(token);
    expect(before).not.toContain("secretLength");
    expect(switched).toContain("global auth state: unchanged");
    expect(after).toContain("github -> github:client");
    expect(after).not.toContain("copy secret");
  });

  it("prints local web dashboard help", async () => {
    const output = await runCli(["dashboard", "web", "--help"]);

    expect(output).toContain("Start the local TokenValve Web UI");
    expect(output).toContain("--host <host>");
    expect(output).toContain("--port <number>");
  });

  it("creates and revokes human intent grants without printing secrets", async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), "tokenvalve-cli-intent-"));
    const configDir = path.join(workspace, ".tokenvalve");

    const useOutput = await runCli([
      "use",
      "--config-dir",
      configDir,
      "--workspace",
      workspace,
      "--provider",
      "vercel",
      "--profile",
      "vercel:team",
      "--environment",
      "production",
      "--risk",
      "production_deploy",
      "--ttl",
      "5m",
      "--yes"
    ]);

    expect(useOutput).toContain("TokenValve human intent");
    expect(useOutput).toContain("created: intent_");
    expect(useOutput).toContain("provider: vercel");
    expect(useOutput).toContain("risk: production_deploy");
    const intentId = useOutput.match(/created: (intent_[^\n]+)/)?.[1];
    expect(intentId).toMatch(/^intent_/);
    expect(readFileSync(path.join(configDir, "intents.yaml"), "utf8")).not.toMatch(/secret-value|api-key/i);

    const revokeOutput = await runCli([
      "revoke",
      intentId ?? "",
      "--config-dir",
      configDir,
      "--yes"
    ]);
    expect(revokeOutput).toContain(`revoked: ${intentId}`);
    const revoked = readFileSync(path.join(configDir, "intents.yaml"), "utf8");
    expect(revoked).toContain(`id: ${intentId}`);
    expect(revoked).toContain("status: revoked");
  });

  it("manages secret profiles without printing secret values", async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), "tokenvalve-cli-secret-"));
    const configDir = path.join(workspace, ".tokenvalve");
    const store = new MemorySecretStore();
    const secret = "ghp_cli_secret_value";

    const addOutput = await runCli([
      "secret",
      "add",
      "--config-dir",
      configDir,
      "--workspace",
      workspace,
      "--profile",
      "github:work",
      "--provider",
      "github",
      "--environment",
      "development",
      "--use-case",
      "cli",
      "--secret-value",
      secret,
      "--yes"
    ], { secretStore: store });

    expect(addOutput).toContain("TokenValve secret");
    expect(addOutput).toContain("added: github:work");
    expect(addOutput).not.toContain(secret);

    const listOutput = await runCli(["secret", "list", "--config-dir", configDir], { secretStore: store });
    expect(listOutput).toContain("github:work");
    expect(listOutput).toContain("unverified");
    expect(listOutput).toContain("fingerprint=sha256:");
    expect(listOutput).not.toContain(secret);
  });

  it("tests, updates, and deletes a secret profile", async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), "tokenvalve-cli-secret-cycle-"));
    const configDir = path.join(workspace, ".tokenvalve");
    const store = new MemorySecretStore();

    await runCli([
      "secret",
      "add",
      "--config-dir",
      configDir,
      "--profile",
      "github:work",
      "--provider",
      "github",
      "--secret-value",
      "ghp_original_secret",
      "--yes"
    ], { secretStore: store });

    const testOutput = await runCli(["secret", "test", "github:work", "--config-dir", configDir], { secretStore: store });
    expect(testOutput).toContain("verified: github:work");
    expect(testOutput).toContain("status: verified");

    const updateOutput = await runCli([
      "secret",
      "update",
      "github:work",
      "--config-dir",
      configDir,
      "--secret-value",
      "ghp_replaced_secret",
      "--yes"
    ], { secretStore: store });
    expect(updateOutput).toContain("status: unverified");
    expect(updateOutput).not.toContain("ghp_replaced_secret");

    const deleteOutput = await runCli([
      "secret",
      "delete",
      "github:work",
      "--config-dir",
      configDir,
      "--yes"
    ], { secretStore: store });
    expect(deleteOutput).toContain("deleted: github:work");

    const listOutput = await runCli(["secret", "list", "--config-dir", configDir], { secretStore: store });
    expect(listOutput).toContain("- none");
  });

  it("manages LLM key profiles and resolves client defaults without printing API keys", async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), "tokenvalve-cli-llm-"));
    const configDir = path.join(workspace, ".tokenvalve");
    const store = new MemorySecretStore();
    const openaiKey = "sk_openai_cli_secret";
    const anthropicKey = "sk_anthropic_cli_secret";

    const openaiOutput = await runCli([
      "llm",
      "add",
      "--config-dir",
      configDir,
      "--workspace",
      workspace,
      "--profile",
      "openai:work",
      "--provider",
      "openai",
      "--api-key",
      openaiKey,
      "--base-url",
      "https://api.openai.com/v1",
      "--model",
      "gpt-4.1",
      "--use-case",
      "code-generation",
      "--client",
      "codex",
      "--yes"
    ], { secretStore: store });
    expect(openaiOutput).toContain("TokenValve llm");
    expect(openaiOutput).toContain("added: openai:work");
    expect(openaiOutput).not.toContain(openaiKey);

    await runCli([
      "llm",
      "add",
      "--config-dir",
      configDir,
      "--workspace",
      workspace,
      "--profile",
      "anthropic:work",
      "--provider",
      "anthropic",
      "--api-key",
      anthropicKey,
      "--model",
      "claude-sonnet",
      "--use-case",
      "review",
      "--yes"
    ], { secretStore: store });

    const listOutput = await runCli(["llm", "list", "--config-dir", configDir], { secretStore: store });
    expect(listOutput).toContain("openai:work");
    expect(listOutput).toContain("anthropic:work");
    expect(listOutput).toContain("model=gpt-4.1");
    expect(listOutput).not.toContain(openaiKey);
    expect(listOutput).not.toContain(anthropicKey);

    await runCli([
      "llm",
      "use",
      "openai:work",
      "--config-dir",
      configDir,
      "--workspace",
      workspace,
      "--provider",
      "openai",
      "--client",
      "codex",
      "--use-case",
      "code-generation",
      "--yes"
    ], { secretStore: store });

    const resolveOutput = await runCli([
      "llm",
      "resolve",
      "--config-dir",
      configDir,
      "--workspace",
      workspace,
      "--provider",
      "openai",
      "--client",
      "codex",
      "--use-case",
      "code-generation"
    ], { secretStore: store });
    expect(resolveOutput).toContain("decision: allow");
    expect(resolveOutput).toContain("profile: openai:work");
    expect(resolveOutput).not.toContain(openaiKey);
  });

  it("lists, shows, and tests local recipes", async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), "tokenvalve-cli-recipe-"));
    const configDir = path.join(workspace, ".tokenvalve");
    const store = new MemorySecretStore();

    await runCli([
      "secret",
      "add",
      "--config-dir",
      configDir,
      "--workspace",
      workspace,
      "--profile",
      "github:work",
      "--provider",
      "github",
      "--environment",
      "development",
      "--secret-value",
      "ghp_recipe_cli_secret",
      "--yes"
    ], { secretStore: store });

    new RecipeStore({ configDir }).save({
      id: "github-repo-view",
      binding: {
        workspace,
        provider: "github",
        profile: "github:work",
        environment: "development",
        capability: "github-cli"
      },
      riskRules: [{ capability: "github-cli", match: ["repo", "view"], risk: "read" }]
    });

    const listOutput = await runCli(["recipe", "list", "--config-dir", configDir], { secretStore: store });
    expect(listOutput).toContain("github-repo-view");
    expect(listOutput).toContain("status=draft");
    expect(listOutput).not.toContain("ghp_recipe_cli_secret");

    const showOutput = await runCli(["recipe", "show", "github-repo-view", "--config-dir", configDir], { secretStore: store });
    expect(showOutput).toContain("TokenValve recipe");
    expect(showOutput).toContain("provider: github");

    const testOutput = await runCli([
      "recipe",
      "test",
      "github-repo-view",
      "--config-dir",
      configDir
    ], { secretStore: store });
    expect(testOutput).toContain("status: verified");
    expect(testOutput).not.toContain("ghp_recipe_cli_secret");
  });

  it("runs GitHub commands with injected token and redacted output", async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), "tokenvalve-cli-github-"));
    const configDir = path.join(workspace, ".tokenvalve");
    const store = new MemorySecretStore();
    const runner = new FakeProcessRunner();
    const token = "ghp_cli_github_token_value_123456";

    await runCli([
      "secret",
      "add",
      "--config-dir",
      configDir,
      "--workspace",
      workspace,
      "--profile",
      "github:work",
      "--provider",
      "github",
      "--environment",
      "development",
      "--secret-value",
      token,
      "--yes"
    ], { secretStore: store });

    const output = await runCli([
      "github",
      "run",
      "--workspace",
      workspace,
      "--config-dir",
      configDir,
      "--",
      "repo",
      "view"
    ], { secretStore: store, processRunner: runner });

    expect(output).toContain("TokenValve github");
    expect(output).toContain("decision: allow");
    expect(output).toContain("profile: github:work");
    expect(output).not.toContain(token);
    expect(runner.calls[0]).toMatchObject({
      command: "gh",
      args: ["repo", "view"],
      env: {
        GH_TOKEN: token,
        GITHUB_TOKEN: token
      }
    });
  });

  it("runs Supabase commands with injected token and redacted output", async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), "tokenvalve-cli-supabase-"));
    const configDir = path.join(workspace, ".tokenvalve");
    const store = new MemorySecretStore();
    const runner = new FakeProcessRunner();
    const token = "sbp_cli_supabase_token_value_123456";

    await runCli([
      "secret",
      "add",
      "--config-dir",
      configDir,
      "--workspace",
      workspace,
      "--profile",
      "supabase:staging",
      "--provider",
      "supabase",
      "--environment",
      "staging",
      "--secret-value",
      token,
      "--yes"
    ], { secretStore: store });

    const output = await runCli([
      "supabase",
      "run",
      "--workspace",
      workspace,
      "--config-dir",
      configDir,
      "--",
      "projects",
      "list"
    ], { secretStore: store, processRunner: runner });

    expect(output).toContain("TokenValve supabase");
    expect(output).toContain("decision: allow");
    expect(output).toContain("profile: supabase:staging");
    expect(output).toContain("environment: staging");
    expect(output).not.toContain(token);
    expect(runner.calls[0]).toMatchObject({
      command: "supabase",
      args: ["projects", "list"],
      env: {
        SUPABASE_ACCESS_TOKEN: token
      }
    });
  });

  it("runs structured HTTP requests with secret headers and redacted output", async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), "tokenvalve-cli-http-"));
    const configDir = path.join(workspace, ".tokenvalve");
    const store = new MemorySecretStore();
    const runner = new FakeHttpRunner();
    const token = "ghp_cli_http_token_value_123456";

    await runCli([
      "secret",
      "add",
      "--config-dir",
      configDir,
      "--workspace",
      workspace,
      "--profile",
      "github:http",
      "--provider",
      "github",
      "--environment",
      "development",
      "--secret-value",
      token,
      "--yes"
    ], { secretStore: store });

    const output = await runCli([
      "http",
      "request",
      "--workspace",
      workspace,
      "--config-dir",
      configDir,
      "--provider",
      "github",
      "--method",
      "GET",
      "--url",
      "https://api.github.com/user",
      "--secret-header",
      "Authorization: Bearer {{token}}"
    ], { secretStore: store, httpRunner: runner });

    expect(output).toContain("TokenValve http");
    expect(output).toContain("decision: allow");
    expect(output).toContain("profile: github:http");
    expect(output).toContain("status: 200");
    expect(output).not.toContain(token);
    expect(runner.calls[0]).toMatchObject({
      method: "GET",
      url: "https://api.github.com/user",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  });

  it("runs curl templates as args arrays with redacted output", async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), "tokenvalve-cli-curl-"));
    const configDir = path.join(workspace, ".tokenvalve");
    const store = new MemorySecretStore();
    const runner = new FakeProcessRunner();
    const token = "ghp_cli_curl_token_value_123456";

    await runCli([
      "secret",
      "add",
      "--config-dir",
      configDir,
      "--workspace",
      workspace,
      "--profile",
      "github:curl",
      "--provider",
      "github",
      "--environment",
      "development",
      "--secret-value",
      token,
      "--yes"
    ], { secretStore: store });

    const output = await runCli([
      "curl",
      "run",
      "--workspace",
      workspace,
      "--config-dir",
      configDir,
      "--provider",
      "github",
      "--method",
      "GET",
      "--url",
      "https://api.github.com/user",
      "--secret-header",
      "Authorization: Bearer {{token}}"
    ], { secretStore: store, processRunner: runner });

    expect(output).toContain("TokenValve curl");
    expect(output).toContain("decision: allow");
    expect(output).toContain("profile: github:curl");
    expect(output).not.toContain(token);
    expect(runner.calls[0]?.command).toBe("curl");
    expect(runner.calls[0]?.args).toEqual([
      "--fail-with-body",
      "--silent",
      "--show-error",
      "--request",
      "GET",
      "https://api.github.com/user",
      "--header",
      `Authorization: Bearer ${token}`
    ]);
  });

  it("uses custom provider HTTP mappings with secret templates", async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), "tokenvalve-cli-custom-http-"));
    const configDir = path.join(workspace, ".tokenvalve");
    const store = new MemorySecretStore();
    const runner = new FakeHttpRunner();
    const token = "custom_http_secret_1234567890";

    await runCli([
      "secret",
      "add",
      "--config-dir",
      configDir,
      "--workspace",
      workspace,
      "--profile",
      "internal-api:default",
      "--provider",
      "internal-api",
      "--environment",
      "development",
      "--secret-value",
      token,
      "--yes"
    ], { secretStore: store });

    const saved = await runCli([
      "custom",
      "add-http",
      "--config-dir",
      configDir,
      "--provider",
      "internal-api",
      "--capability",
      "internal-status",
      "--host",
      "internal.example.test",
      "--path-prefix",
      "/status",
      "--method",
      "GET",
      "--secret-header",
      "Authorization: Bearer {{token}}",
      "--risk",
      "read"
    ]);
    const output = await runCli([
      "http",
      "request",
      "--workspace",
      workspace,
      "--config-dir",
      configDir,
      "--provider",
      "internal-api",
      "--capability",
      "internal-status",
      "--method",
      "GET",
      "--url",
      "https://internal.example.test/status/health"
    ], { secretStore: store, httpRunner: runner });

    expect(saved).toContain("plaintext secret: not stored");
    expect(output).toContain("decision: allow");
    expect(output).toContain("provider: internal-api");
    expect(output).not.toContain(token);
    expect(runner.calls[0]).toMatchObject({
      method: "GET",
      url: "https://internal.example.test/status/health",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  });

  it("runs custom script mappings with child-scoped env secrets", async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), "tokenvalve-cli-custom-script-"));
    const configDir = path.join(workspace, ".tokenvalve");
    const store = new MemorySecretStore();
    const runner = new FakeProcessRunner();
    const script = path.join(workspace, "internal-tool");
    const token = "custom_script_secret_1234567890";

    await runCli([
      "secret",
      "add",
      "--config-dir",
      configDir,
      "--workspace",
      workspace,
      "--profile",
      "internal-tool:default",
      "--provider",
      "internal-tool",
      "--environment",
      "development",
      "--secret-value",
      token,
      "--yes"
    ], { secretStore: store });

    await runCli([
      "custom",
      "add-script",
      "--config-dir",
      configDir,
      "--provider",
      "internal-tool",
      "--capability",
      "internal-script",
      "--script",
      script,
      "--env",
      "INTERNAL_TOKEN={{token}}",
      "--risk",
      "read"
    ]);

    const before = process.env.INTERNAL_TOKEN;
    const output = await runCli([
      "custom",
      "script",
      "run",
      "--workspace",
      workspace,
      "--config-dir",
      configDir,
      "--provider",
      "internal-tool",
      "--capability",
      "internal-script",
      "--script",
      script
    ], { secretStore: store, processRunner: runner });

    expect(output).toContain("TokenValve custom script");
    expect(output).toContain("decision: allow");
    expect(output).not.toContain(token);
    expect(runner.calls[0]).toMatchObject({
      command: script,
      env: { INTERNAL_TOKEN: token }
    });
    expect(process.env.INTERNAL_TOKEN).toBe(before);
  });

  it("prints SSH command help", async () => {
    await expect(runCli(["ssh", "run", "--help"])).resolves.toContain("Run an allowlisted SSH command");
    await expect(runCli(["git-ssh", "run", "--help"])).resolves.toContain("Run an allowlisted git over SSH operation");
  });

  it("runs git over SSH with scoped GIT_SSH_COMMAND and redacted output", async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), "tokenvalve-cli-git-ssh-"));
    const configDir = path.join(workspace, ".tokenvalve");
    const store = new MemorySecretStore();
    const runner = new FakeProcessRunner();
    const identityFile = "/Users/xing/.ssh/tokenvalve_cli";

    await runCli([
      "secret",
      "add",
      "--config-dir",
      configDir,
      "--workspace",
      workspace,
      "--profile",
      "github:ssh",
      "--provider",
      "github",
      "--environment",
      "development",
      "--secret-value",
      identityFile,
      "--field",
      "identity_file",
      "--yes"
    ], { secretStore: store });

    const output = await runCli([
      "git-ssh",
      "run",
      "--workspace",
      workspace,
      "--config-dir",
      configDir,
      "--provider",
      "github",
      "--remote-url",
      "git@github.com:ThindoLab/token-valve.git",
      "--operation",
      "fetch",
      "--known-hosts-policy",
      "strict",
      "--known-hosts-file",
      "/Users/xing/.ssh/known_hosts"
    ], { secretStore: store, processRunner: runner });

    expect(output).toContain("TokenValve git-ssh");
    expect(output).toContain("decision: allow");
    expect(output).toContain("profile: github:ssh");
    expect(output).not.toContain(identityFile);
    expect(runner.calls[0]?.command).toBe("git");
    expect(runner.calls[0]?.env.GIT_SSH_COMMAND).toContain(identityFile);
  });

  it("runs Vercel preview deploy with injected env and redacted output", async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), "tokenvalve-cli-vercel-"));
    const configDir = path.join(workspace, ".tokenvalve");
    const store = new MemorySecretStore();
    const runner = new FakeProcessRunner();
    const token = "vercel_cli_token_value_123456789";

    await runCli([
      "secret",
      "add",
      "--config-dir",
      configDir,
      "--workspace",
      workspace,
      "--profile",
      "vercel:team",
      "--provider",
      "vercel",
      "--environment",
      "preview",
      "--secret-value",
      token,
      "--yes"
    ], { secretStore: store });

    await runCli([
      "secret",
      "update",
      "vercel:team",
      "--config-dir",
      configDir,
      "--status",
      "verified",
      "--yes"
    ], { secretStore: store });

    const output = await runCli([
      "vercel",
      "run",
      "--workspace",
      workspace,
      "--config-dir",
      configDir,
      "--",
      "deploy"
    ], { secretStore: store, processRunner: runner });

    expect(output).toContain("TokenValve vercel");
    expect(output).toContain("decision: allow");
    expect(output).toContain("profile: vercel:team");
    expect(output).toContain("risk: write");
    expect(output).not.toContain(token);
    expect(runner.calls[0]).toMatchObject({
      command: "vercel",
      args: ["deploy"],
      env: {
        VERCEL_TOKEN: token
      }
    });
  });

  it("prints Vercel run help", async () => {
    await expect(runCli(["vercel", "run", "--help"])).resolves.toContain("Run a Vercel command");
  });
});
