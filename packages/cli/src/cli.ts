import { Command } from "commander";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  getCoreHealth,
  HumanIntentStore,
  runCurlTemplate,
  runGitSsh,
  MacOSKeychainSecretStore,
  ProfileInventory,
  RecipeStore,
  runGitHubCli,
  runHttpRequest,
  runSshCommand,
  runSupabaseCli,
  runVercelCli,
  resolveContext,
  runScenarioInit,
  type AdapterDefinition,
  type HttpRunner,
  type KnownHostsPolicy,
  type ProcessRunner,
  type ProfileMetadata,
  type ProfileStatus,
  type RiskLevel,
  type SecretStore,
  type SupportedInitProvider
} from "@tokenvalve/core";
import packageJson from "../package.json" with { type: "json" };

export interface CliOptions {
  writeOut?: (value: string) => void;
  secretStore?: SecretStore;
  processRunner?: ProcessRunner;
  httpRunner?: HttpRunner;
}

export function createCli(options: CliOptions = {}): Command {
  const writeOut = options.writeOut ?? ((value: string) => process.stdout.write(value));
  const program = new Command();

  program
    .name("tokenvalve")
    .description("Local secret manager, credential broker, and execution gateway for AI agents.")
    .version(packageJson.version);

  program
    .command("doctor")
    .description("Run project skeleton diagnostics.")
    .action(() => {
      const health = getCoreHealth();

      writeOut(
        [
          "TokenValve doctor",
          `- ${health.message}`,
          "- real resolver, secret store, MCP tools, shims, and dashboard diagnostics are implemented in later phases"
        ].join("\n") + "\n"
      );
    });

  program
    .command("use")
    .description("Create a TTL-bound local human intent grant.")
    .requiredOption("--workspace <path>", "Workspace path.")
    .requiredOption("--provider <name>", "Provider name.")
    .requiredOption("--profile <id>", "Profile id.")
    .requiredOption("--environment <name>", "Environment name.")
    .requiredOption("--risk <risk>", "Risk to authorize.")
    .requiredOption("--ttl <duration>", "TTL such as 30s, 10m, or 2h.")
    .option("--config-dir <path>", "TokenValve config directory.")
    .option("--yes", "Confirm non-interactive authorization.")
    .action((rawOptions: UseCommandOptions) => {
      const store = createIntentStore(rawOptions.configDir, rawOptions.workspace);
      const result = store.create({
        workspace: path.resolve(rawOptions.workspace),
        provider: rawOptions.provider,
        profile: rawOptions.profile,
        environment: rawOptions.environment,
        risk: normalizeRisk(rawOptions.risk),
        ttl: rawOptions.ttl,
        yes: Boolean(rawOptions.yes)
      });
      writeOut(formatIntentChanged("created", result.intent));
    });

  program
    .command("revoke")
    .description("Revoke a local human intent grant.")
    .argument("<intent>", "Human intent id.")
    .option("--config-dir <path>", "TokenValve config directory.")
    .option("--workspace <path>", "Workspace path used to locate the default config directory.")
    .option("--yes", "Confirm non-interactive revoke.")
    .action((intent: string, rawOptions: RevokeCommandOptions) => {
      const store = createIntentStore(rawOptions.configDir, rawOptions.workspace);
      const result = store.revoke({
        id: intent,
        yes: Boolean(rawOptions.yes)
      });
      writeOut(formatIntentChanged("revoked", result.intent));
    });

  program
    .command("init")
    .description("Create TokenValve workspace configuration.")
    .option("--workspace <path>", "Workspace path.", process.cwd())
    .option("--config-dir <path>", "TokenValve config directory.")
    .option("--provider <name>", "Provider to configure.", collectValues, [])
    .option("--add-provider <name>", "Provider to add to existing config.", collectValues, [])
    .option("--llm-key <profile>", "LLM key profile metadata to add.", collectValues, [])
    .option("--yes", "Use non-interactive defaults.")
    .option("--dry-run", "Print the generated plan without writing files.")
    .action((rawOptions: InitCommandOptions) => {
      const workspace = path.resolve(rawOptions.workspace);
      const configDir = path.resolve(rawOptions.configDir ?? path.join(workspace, ".tokenvalve"));

      const result = runScenarioInit({
        workspace,
        configDir,
        providers: normalizeProviders(rawOptions.provider),
        addProviders: normalizeProviders(rawOptions.addProvider),
        llmKeys: rawOptions.llmKey,
        yes: Boolean(rawOptions.yes),
        dryRun: Boolean(rawOptions.dryRun),
        cliAvailability: {
          gh: commandAvailable("gh"),
          supabase: commandAvailable("supabase"),
          vercel: commandAvailable("vercel")
        }
      });

      writeOut(formatInitResult(result, Boolean(rawOptions.dryRun)));
    });

  const secret = program
    .command("secret")
    .description("Manage local secret profile metadata and secret store entries.");

  secret
    .command("add")
    .description("Add a secret profile.")
    .requiredOption("--profile <id>", "Profile id.")
    .requiredOption("--provider <name>", "Provider name.")
    .option("--environment <name>", "Environment name.")
    .option("--display-name <name>", "Display name.")
    .option("--use-case <name>", "Use case label.", collectValues, [])
    .option("--workspace <path>", "Workspace path to bind.")
    .option("--config-dir <path>", "TokenValve config directory.")
    .requiredOption("--secret-value <value>", "Secret value. Prefer local UI or prompt in later phases.")
    .option("--field <name>", "Secret field name.", "token")
    .option("--replace", "Replace an existing profile.")
    .option("--yes", "Confirm non-interactive write.")
    .action(async (rawOptions: SecretAddCommandOptions) => {
      const inventory = createInventory(rawOptions.configDir, rawOptions.workspace, options.secretStore);
      const result = await inventory.addProfile({
        profileId: rawOptions.profile,
        provider: rawOptions.provider,
        environment: rawOptions.environment,
        displayName: rawOptions.displayName,
        useCases: rawOptions.useCase,
        workspace: rawOptions.workspace ? path.resolve(rawOptions.workspace) : undefined,
        secretValue: rawOptions.secretValue,
        field: rawOptions.field,
        replace: Boolean(rawOptions.replace),
        yes: Boolean(rawOptions.yes)
      });
      writeOut(formatSecretChanged("added", result.profile));
    });

  secret
    .command("list")
    .description("List secret profiles without revealing secret values.")
    .option("--config-dir <path>", "TokenValve config directory.")
    .action((rawOptions: SecretListCommandOptions) => {
      const inventory = createInventory(rawOptions.configDir, undefined, options.secretStore);
      writeOut(formatSecretList(inventory.listProfiles()));
    });

  secret
    .command("update")
    .description("Update a secret profile.")
    .argument("<profile>", "Profile id.")
    .option("--config-dir <path>", "TokenValve config directory.")
    .option("--provider <name>", "Provider name.")
    .option("--environment <name>", "Environment name.")
    .option("--display-name <name>", "Display name.")
    .option("--use-case <name>", "Use case label.", collectValues, [])
    .option("--status <status>", "Profile status.")
    .option("--secret-value <value>", "Replacement secret value.")
    .option("--field <name>", "Secret field name.", "token")
    .option("--yes", "Confirm non-interactive write.")
    .action(async (profile: string, rawOptions: SecretUpdateCommandOptions) => {
      const inventory = createInventory(rawOptions.configDir, undefined, options.secretStore);
      const result = await inventory.updateProfile({
        profileId: profile,
        provider: rawOptions.provider,
        environment: rawOptions.environment,
        displayName: rawOptions.displayName,
        useCases: rawOptions.useCase.length > 0 ? rawOptions.useCase : undefined,
        status: rawOptions.status ? normalizeStatus(rawOptions.status) : undefined,
        secretValue: rawOptions.secretValue,
        field: rawOptions.field,
        yes: Boolean(rawOptions.yes)
      });
      writeOut(formatSecretChanged("updated", result.profile));
    });

  secret
    .command("delete")
    .description("Delete a secret profile.")
    .argument("<profile>", "Profile id.")
    .option("--config-dir <path>", "TokenValve config directory.")
    .option("--field <name>", "Secret field name.", "token")
    .option("--yes", "Confirm non-interactive delete.")
    .action(async (profile: string, rawOptions: SecretDeleteCommandOptions) => {
      const inventory = createInventory(rawOptions.configDir, undefined, options.secretStore);
      const deleted = await inventory.deleteProfile({
        profileId: profile,
        field: rawOptions.field,
        yes: Boolean(rawOptions.yes)
      });
      writeOut(formatSecretChanged("deleted", deleted));
    });

  secret
    .command("test")
    .description("Test a secret profile and mark it verified when local checks pass.")
    .argument("<profile>", "Profile id.")
    .option("--config-dir <path>", "TokenValve config directory.")
    .option("--field <name>", "Secret field name.", "token")
    .action(async (profile: string, rawOptions: SecretTestCommandOptions) => {
      const inventory = createInventory(rawOptions.configDir, undefined, options.secretStore);
      const result = await inventory.testProfile({
        profileId: profile,
        field: rawOptions.field
      });
      writeOut(formatSecretChanged("verified", result.profile));
    });

  const llm = program
    .command("llm")
    .description("Manage LLM API key profiles and defaults.");

  llm
    .command("add")
    .description("Add an LLM API key profile.")
    .requiredOption("--profile <id>", "Profile id.")
    .requiredOption("--provider <name>", "LLM provider.")
    .option("--config-dir <path>", "TokenValve config directory.")
    .option("--workspace <path>", "Workspace path to bind.")
    .requiredOption("--api-key <value>", "LLM API key. Prefer local UI or prompt in later phases.")
    .option("--base-url <url>", "Provider base URL.")
    .option("--organization <id>", "Provider organization id.")
    .option("--project <id>", "Provider project id.")
    .option("--model <name>", "Default model.")
    .option("--use-case <name>", "Use case label.", collectValues, [])
    .option("--client <name>", "Client label.", collectValues, [])
    .option("--display-name <name>", "Display name.")
    .option("--replace", "Replace an existing profile.")
    .option("--yes", "Confirm non-interactive write.")
    .action(async (rawOptions: LlmAddCommandOptions) => {
      const provider = normalizeLlmProvider(rawOptions.provider);
      const inventory = createInventory(rawOptions.configDir, rawOptions.workspace, options.secretStore);
      const result = await inventory.addProfile({
        profileId: rawOptions.profile,
        provider,
        displayName: rawOptions.displayName,
        useCases: rawOptions.useCase,
        workspace: rawOptions.workspace ? path.resolve(rawOptions.workspace) : undefined,
        secretValue: rawOptions.apiKey,
        field: "api_key",
        replace: Boolean(rawOptions.replace),
        yes: Boolean(rawOptions.yes),
        llm: {
          baseUrl: rawOptions.baseUrl,
          organization: rawOptions.organization,
          project: rawOptions.project,
          defaultModel: rawOptions.model,
          clientLabels: rawOptions.client
        }
      });
      writeOut(formatLlmChanged("added", result.profile));
    });

  llm
    .command("list")
    .description("List LLM key profiles without revealing API keys.")
    .option("--config-dir <path>", "TokenValve config directory.")
    .action((rawOptions: LlmListCommandOptions) => {
      const inventory = createInventory(rawOptions.configDir, undefined, options.secretStore);
      writeOut(formatLlmList(inventory.listProfiles().filter(isLlmProfile)));
    });

  llm
    .command("use")
    .description("Set the default LLM profile for a workspace, client, or use case.")
    .argument("<profile>", "Profile id.")
    .requiredOption("--workspace <path>", "Workspace path.")
    .requiredOption("--provider <name>", "LLM provider.")
    .option("--config-dir <path>", "TokenValve config directory.")
    .option("--client <name>", "Agent client override.")
    .option("--use-case <name>", "Use case override.")
    .option("--yes", "Confirm non-interactive write.")
    .action((profile: string, rawOptions: LlmUseCommandOptions) => {
      const provider = normalizeLlmProvider(rawOptions.provider);
      const inventory = createInventory(rawOptions.configDir, rawOptions.workspace, options.secretStore);
      const result = inventory.setDefaultProfile({
        profileId: profile,
        provider,
        workspace: path.resolve(rawOptions.workspace),
        client: rawOptions.client,
        useCase: rawOptions.useCase,
        yes: Boolean(rawOptions.yes)
      });
      writeOut(formatLlmChanged("selected", result));
    });

  llm
    .command("resolve")
    .description("Resolve the LLM profile for a workspace, client, and use case.")
    .requiredOption("--workspace <path>", "Workspace path.")
    .requiredOption("--provider <name>", "LLM provider.")
    .option("--config-dir <path>", "TokenValve config directory.")
    .option("--client <name>", "Agent client.")
    .option("--use-case <name>", "Use case.", "code-generation")
    .action((rawOptions: LlmResolveCommandOptions) => {
      const provider = normalizeLlmProvider(rawOptions.provider);
      const inventory = createInventory(rawOptions.configDir, rawOptions.workspace, options.secretStore);
      const profiles = inventory.listProfiles();
      const result = resolveContext({
        workspace: path.resolve(rawOptions.workspace),
        config: {
          profiles,
          workspaces: readBindingsFromInventory(inventory)
        },
        adapters: [createLlmAdapter(provider, profiles)],
        session: rawOptions.client ? { id: `cli:${rawOptions.client}`, client: rawOptions.client } : undefined,
        execution: {
          kind: "llm",
          provider,
          useCase: rawOptions.useCase
        }
      });
      writeOut(formatLlmResolve(result));
    });

  const recipe = program
    .command("recipe")
    .description("Manage verified reusable TokenValve recipes.");

  recipe
    .command("list")
    .description("List local recipes.")
    .option("--config-dir <path>", "TokenValve config directory.")
    .option("--workspace <path>", "Workspace path used to locate the default config directory.")
    .action((rawOptions: RecipeListCommandOptions) => {
      writeOut(formatRecipeList(createRecipeStore(rawOptions.configDir, rawOptions.workspace).list()));
    });

  recipe
    .command("show")
    .description("Show a local recipe.")
    .argument("<recipe>", "Recipe id.")
    .option("--config-dir <path>", "TokenValve config directory.")
    .option("--workspace <path>", "Workspace path used to locate the default config directory.")
    .action((recipeId: string, rawOptions: RecipeShowCommandOptions) => {
      writeOut(formatRecipeShow(createRecipeStore(rawOptions.configDir, rawOptions.workspace).show(recipeId)));
    });

  recipe
    .command("test")
    .description("Test a local recipe against configured metadata.")
    .argument("<recipe>", "Recipe id.")
    .option("--config-dir <path>", "TokenValve config directory.")
    .option("--workspace <path>", "Workspace path used to locate the default config directory.")
    .action((recipeId: string, rawOptions: RecipeTestCommandOptions) => {
      const store = createRecipeStore(rawOptions.configDir, rawOptions.workspace);
      const inventory = createInventory(rawOptions.configDir, rawOptions.workspace, options.secretStore);
      const result = store.test(recipeId, {
        profiles: inventory.listProfiles(),
        workspaces: inventory.getBindings()
      });
      writeOut(formatRecipeShow(result));
    });

  const github = program
    .command("github")
    .description("Run GitHub CLI commands with per-execution TokenValve credentials.");

  github
    .command("run")
    .description("Run a low-risk gh command with a resolved GitHub profile.")
    .requiredOption("--workspace <path>", "Workspace path.")
    .option("--config-dir <path>", "TokenValve config directory.")
    .option("--session-id <id>", "Agent session id.")
    .option("--client <name>", "Agent client.")
    .option("--profile <id>", "Session-scoped GitHub profile override.")
    .allowUnknownOption(true)
    .argument("[args...]", "Arguments after -- are passed to gh.")
    .action(async (args: string[], rawOptions: GithubRunCommandOptions) => {
      const inventory = createInventory(rawOptions.configDir, rawOptions.workspace, options.secretStore);
      const result = await runGitHubCli({
        workspace: path.resolve(rawOptions.workspace),
        config: {
          profiles: inventory.listProfiles(),
          workspaces: inventory.getBindings()
        },
        secretStore: options.secretStore ?? new MacOSKeychainSecretStore(),
        args: normalizeGithubArgs(args),
        runner: options.processRunner,
        activeIntents: readActiveIntents(rawOptions.configDir, rawOptions.workspace),
        session: rawOptions.profile ? {
          id: rawOptions.sessionId ?? "cli",
          client: rawOptions.client,
          providers: {
            github: {
              profile: rawOptions.profile,
              environment: "development"
            }
          }
        } : rawOptions.sessionId || rawOptions.client ? {
          id: rawOptions.sessionId ?? "cli",
          client: rawOptions.client
        } : undefined
      });
      writeOut(formatGithubRun(result));
    });

  const supabase = program
    .command("supabase")
    .description("Run Supabase CLI commands with per-execution TokenValve credentials.");

  supabase
    .command("run")
    .description("Run a low-risk supabase command with a resolved Supabase profile.")
    .requiredOption("--workspace <path>", "Workspace path.")
    .option("--config-dir <path>", "TokenValve config directory.")
    .option("--session-id <id>", "Agent session id.")
    .option("--client <name>", "Agent client.")
    .option("--profile <id>", "Session-scoped Supabase profile override.")
    .option("--environment <name>", "Session-scoped environment override.")
    .allowUnknownOption(true)
    .argument("[args...]", "Arguments after -- are passed to supabase.")
    .action(async (args: string[], rawOptions: SupabaseRunCommandOptions) => {
      const inventory = createInventory(rawOptions.configDir, rawOptions.workspace, options.secretStore);
      const result = await runSupabaseCli({
        workspace: path.resolve(rawOptions.workspace),
        config: {
          profiles: inventory.listProfiles(),
          workspaces: inventory.getBindings()
        },
        secretStore: options.secretStore ?? new MacOSKeychainSecretStore(),
        args: normalizeSupabaseArgs(args),
        runner: options.processRunner,
        activeIntents: readActiveIntents(rawOptions.configDir, rawOptions.workspace),
        session: rawOptions.profile ? {
          id: rawOptions.sessionId ?? "cli",
          client: rawOptions.client,
          providers: {
            supabase: {
              profile: rawOptions.profile,
              environment: rawOptions.environment
            }
          }
        } : rawOptions.sessionId || rawOptions.client ? {
          id: rawOptions.sessionId ?? "cli",
          client: rawOptions.client
        } : undefined
      });
      writeOut(formatSupabaseRun(result));
    });

  const http = program
    .command("http")
    .description("Run structured HTTP requests with TokenValve credentials.");

  http
    .command("request")
    .description("Run an allowlisted structured HTTP request.")
    .requiredOption("--workspace <path>", "Workspace path.")
    .requiredOption("--provider <name>", "Provider name.")
    .requiredOption("--method <method>", "HTTP method.")
    .requiredOption("--url <url>", "Request URL.")
    .option("--config-dir <path>", "TokenValve config directory.")
    .option("--capability <id>", "Capability id.", "http-request")
    .option("--header <header>", "Static header as Name: value.", collectValues, [])
    .option("--secret-header <header>", "Secret template header as Name: Bearer {{token}}.", collectValues, [])
    .option("--body <body>", "Request body.")
    .action(async (rawOptions: HttpRequestCommandOptions) => {
      const inventory = createInventory(rawOptions.configDir, rawOptions.workspace, options.secretStore);
      const result = await runHttpRequest({
        workspace: path.resolve(rawOptions.workspace),
        config: {
          profiles: inventory.listProfiles(),
          workspaces: inventory.getBindings()
        },
        adapters: [createHttpCliAdapter(rawOptions.provider, rawOptions.capability)],
        secretStore: options.secretStore ?? new MacOSKeychainSecretStore(),
        provider: rawOptions.provider,
        method: rawOptions.method,
        url: rawOptions.url,
        headers: parseHeaders(rawOptions.header),
        body: rawOptions.body,
        secretTemplates: {
          headers: parseHeaders(rawOptions.secretHeader)
        },
        runner: options.httpRunner
      });
      writeOut(formatHttpRun(result));
    });

  const curl = program
    .command("curl")
    .description("Run structured curl templates with TokenValve credentials.");

  curl
    .command("run")
    .description("Run an allowlisted curl request without shell strings.")
    .requiredOption("--workspace <path>", "Workspace path.")
    .requiredOption("--provider <name>", "Provider name.")
    .requiredOption("--method <method>", "HTTP method.")
    .requiredOption("--url <url>", "Request URL.")
    .option("--config-dir <path>", "TokenValve config directory.")
    .option("--capability <id>", "Capability id.", "curl-template")
    .option("--header <header>", "Static header as Name: value.", collectValues, [])
    .option("--secret-header <header>", "Secret template header as Name: Bearer {{token}}.", collectValues, [])
    .option("--body <body>", "Request body.")
    .action(async (rawOptions: CurlRunCommandOptions) => {
      const inventory = createInventory(rawOptions.configDir, rawOptions.workspace, options.secretStore);
      const result = await runCurlTemplate({
        workspace: path.resolve(rawOptions.workspace),
        config: {
          profiles: inventory.listProfiles(),
          workspaces: inventory.getBindings()
        },
        adapters: [createCurlCliAdapter(rawOptions.provider, rawOptions.capability)],
        secretStore: options.secretStore ?? new MacOSKeychainSecretStore(),
        provider: rawOptions.provider,
        method: rawOptions.method,
        url: rawOptions.url,
        headers: parseHeaders(rawOptions.header),
        body: rawOptions.body,
        secretTemplates: {
          headers: parseHeaders(rawOptions.secretHeader)
        },
        runner: options.processRunner
      });
      writeOut(formatCurlRun(result));
    });

  const ssh = program
    .command("ssh")
    .description("Run SSH commands with per-execution TokenValve credentials.");

  ssh
    .command("run")
    .description("Run an allowlisted SSH command without changing global SSH state.")
    .requiredOption("--workspace <path>", "Workspace path.")
    .requiredOption("--host <host>", "SSH host.")
    .option("--provider <name>", "Provider name.", "github")
    .option("--config-dir <path>", "TokenValve config directory.")
    .option("--user <name>", "SSH user.")
    .option("--port <number>", "SSH port.", parseInteger)
    .option("--operation <name>", "Structured operation.", "connect")
    .option("--known-hosts-policy <mode>", "Known hosts policy: strict, accept-new, or off.")
    .option("--known-hosts-file <path>", "Known hosts file for strict or accept-new policy.")
    .option("--identity-file-field <field>", "Secret field containing an identity file path.", "identity_file")
    .option("--private-key-field <field>", "Secret field containing private key content.", "private_key")
    .option("--agent-socket-field <field>", "Secret field containing SSH_AUTH_SOCK.", "agent_socket")
    .allowUnknownOption(true)
    .argument("[command...]", "Remote command after --.")
    .action(async (command: string[], rawOptions: SshRunCommandOptions) => {
      const inventory = createInventory(rawOptions.configDir, rawOptions.workspace, options.secretStore);
      const result = await runSshCommand({
        workspace: path.resolve(rawOptions.workspace),
        config: {
          profiles: inventory.listProfiles(),
          workspaces: inventory.getBindings()
        },
        secretStore: options.secretStore ?? new MacOSKeychainSecretStore(),
        provider: rawOptions.provider,
        host: rawOptions.host,
        user: rawOptions.user,
        port: rawOptions.port,
        operation: rawOptions.operation,
        command: normalizeOptionalPassthroughArgs(command),
        knownHosts: parseKnownHostsPolicy(rawOptions.knownHostsPolicy, rawOptions.knownHostsFile),
        credentialFields: {
          identityFileField: rawOptions.identityFileField,
          privateKeyField: rawOptions.privateKeyField,
          agentSocketField: rawOptions.agentSocketField
        },
        activeIntents: readActiveIntents(rawOptions.configDir, rawOptions.workspace),
        runner: options.processRunner
      });
      writeOut(formatSshRun("ssh", result));
    });

  const gitSsh = program
    .command("git-ssh")
    .description("Run git over SSH with per-execution TokenValve credentials.");

  gitSsh
    .command("run")
    .description("Run an allowlisted git over SSH operation.")
    .requiredOption("--workspace <path>", "Workspace path.")
    .requiredOption("--remote-url <url>", "Git SSH remote URL.")
    .requiredOption("--operation <name>", "Structured git operation, for example fetch, ls-remote, or push.")
    .option("--provider <name>", "Provider name.", "github")
    .option("--config-dir <path>", "TokenValve config directory.")
    .option("--known-hosts-policy <mode>", "Known hosts policy: strict, accept-new, or off.")
    .option("--known-hosts-file <path>", "Known hosts file for strict or accept-new policy.")
    .option("--identity-file-field <field>", "Secret field containing an identity file path.", "identity_file")
    .option("--private-key-field <field>", "Secret field containing private key content.", "private_key")
    .option("--agent-socket-field <field>", "Secret field containing SSH_AUTH_SOCK.", "agent_socket")
    .allowUnknownOption(true)
    .argument("[args...]", "Git arguments after --. Defaults from --operation when omitted.")
    .action(async (args: string[], rawOptions: GitSshRunCommandOptions) => {
      const inventory = createInventory(rawOptions.configDir, rawOptions.workspace, options.secretStore);
      const result = await runGitSsh({
        workspace: path.resolve(rawOptions.workspace),
        config: {
          profiles: inventory.listProfiles(),
          workspaces: inventory.getBindings()
        },
        secretStore: options.secretStore ?? new MacOSKeychainSecretStore(),
        provider: rawOptions.provider,
        remoteUrl: rawOptions.remoteUrl,
        operation: rawOptions.operation,
        gitArgs: normalizeOptionalPassthroughArgs(args),
        knownHosts: parseKnownHostsPolicy(rawOptions.knownHostsPolicy, rawOptions.knownHostsFile),
        credentialFields: {
          identityFileField: rawOptions.identityFileField,
          privateKeyField: rawOptions.privateKeyField,
          agentSocketField: rawOptions.agentSocketField
        },
        activeIntents: readActiveIntents(rawOptions.configDir, rawOptions.workspace),
        runner: options.processRunner
      });
      writeOut(formatSshRun("git-ssh", result));
    });

  const vercel = program
    .command("vercel")
    .description("Run Vercel CLI commands with per-execution TokenValve credentials.");

  vercel
    .command("run")
    .description("Run a Vercel command with a resolved Vercel profile.")
    .requiredOption("--workspace <path>", "Workspace path.")
    .option("--config-dir <path>", "TokenValve config directory.")
    .option("--session-id <id>", "Agent session id.")
    .option("--client <name>", "Agent client.")
    .option("--profile <id>", "Session-scoped Vercel profile override.")
    .option("--environment <name>", "Session-scoped environment override.")
    .allowUnknownOption(true)
    .argument("[args...]", "Arguments after -- are passed to vercel.")
    .action(async (args: string[], rawOptions: VercelRunCommandOptions) => {
      const inventory = createInventory(rawOptions.configDir, rawOptions.workspace, options.secretStore);
      const result = await runVercelCli({
        workspace: path.resolve(rawOptions.workspace),
        config: {
          profiles: inventory.listProfiles(),
          workspaces: inventory.getBindings()
        },
        secretStore: options.secretStore ?? new MacOSKeychainSecretStore(),
        args: normalizeVercelArgs(args),
        runner: options.processRunner,
        activeIntents: readActiveIntents(rawOptions.configDir, rawOptions.workspace),
        session: rawOptions.profile ? {
          id: rawOptions.sessionId ?? "cli",
          client: rawOptions.client,
          providers: {
            vercel: {
              profile: rawOptions.profile,
              environment: rawOptions.environment
            }
          }
        } : rawOptions.sessionId || rawOptions.client ? {
          id: rawOptions.sessionId ?? "cli",
          client: rawOptions.client
        } : undefined
      });
      writeOut(formatVercelRun(result));
    });

  return program;
}

interface InitCommandOptions {
  workspace: string;
  configDir?: string;
  provider: string[];
  addProvider: string[];
  llmKey: string[];
  yes?: boolean;
  dryRun?: boolean;
}

interface UseCommandOptions {
  workspace: string;
  provider: string;
  profile: string;
  environment: string;
  risk: string;
  ttl: string;
  configDir?: string;
  yes?: boolean;
}

interface RevokeCommandOptions {
  configDir?: string;
  workspace?: string;
  yes?: boolean;
}

interface SecretAddCommandOptions {
  profile: string;
  provider: string;
  environment?: string;
  displayName?: string;
  useCase: string[];
  workspace?: string;
  configDir?: string;
  secretValue: string;
  field: string;
  replace?: boolean;
  yes?: boolean;
}

interface SecretListCommandOptions {
  configDir?: string;
}

interface SecretUpdateCommandOptions {
  configDir?: string;
  provider?: string;
  environment?: string;
  displayName?: string;
  useCase: string[];
  status?: string;
  secretValue?: string;
  field: string;
  yes?: boolean;
}

interface SecretDeleteCommandOptions {
  configDir?: string;
  field: string;
  yes?: boolean;
}

interface SecretTestCommandOptions {
  configDir?: string;
  field: string;
}

interface LlmAddCommandOptions {
  profile: string;
  provider: string;
  configDir?: string;
  workspace?: string;
  apiKey: string;
  baseUrl?: string;
  organization?: string;
  project?: string;
  model?: string;
  useCase: string[];
  client: string[];
  displayName?: string;
  replace?: boolean;
  yes?: boolean;
}

interface LlmListCommandOptions {
  configDir?: string;
}

interface LlmUseCommandOptions {
  workspace: string;
  provider: string;
  configDir?: string;
  client?: string;
  useCase?: string;
  yes?: boolean;
}

interface LlmResolveCommandOptions {
  workspace: string;
  provider: string;
  configDir?: string;
  client?: string;
  useCase: string;
}

interface RecipeListCommandOptions {
  configDir?: string;
  workspace?: string;
}

interface RecipeShowCommandOptions {
  configDir?: string;
  workspace?: string;
}

interface RecipeTestCommandOptions {
  configDir?: string;
  workspace?: string;
}

interface GithubRunCommandOptions {
  workspace: string;
  configDir?: string;
  sessionId?: string;
  client?: string;
  profile?: string;
}

interface SupabaseRunCommandOptions {
  workspace: string;
  configDir?: string;
  sessionId?: string;
  client?: string;
  profile?: string;
  environment?: string;
}

interface HttpRequestCommandOptions {
  workspace: string;
  provider: string;
  method: string;
  url: string;
  configDir?: string;
  capability: string;
  header: string[];
  secretHeader: string[];
  body?: string;
}

interface CurlRunCommandOptions {
  workspace: string;
  provider: string;
  method: string;
  url: string;
  configDir?: string;
  capability: string;
  header: string[];
  secretHeader: string[];
  body?: string;
}

interface SshRunCommandOptions {
  workspace: string;
  host: string;
  provider: string;
  configDir?: string;
  user?: string;
  port?: number;
  operation: string;
  knownHostsPolicy?: string;
  knownHostsFile?: string;
  identityFileField: string;
  privateKeyField: string;
  agentSocketField: string;
}

interface GitSshRunCommandOptions {
  workspace: string;
  remoteUrl: string;
  operation: string;
  provider: string;
  configDir?: string;
  knownHostsPolicy?: string;
  knownHostsFile?: string;
  identityFileField: string;
  privateKeyField: string;
  agentSocketField: string;
}

interface VercelRunCommandOptions {
  workspace: string;
  configDir?: string;
  sessionId?: string;
  client?: string;
  profile?: string;
  environment?: string;
}

function collectValues(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function parseInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer: ${value}`);
  }
  return parsed;
}

function normalizeProviders(values: string[]): SupportedInitProvider[] {
  return values.map((value) => {
    if (value === "github" || value === "supabase" || value === "vercel") {
      return value;
    }
    throw new Error(`Unsupported provider for Phase 6 init: ${value}`);
  });
}

function commandAvailable(command: string): boolean {
  const pathEntries = process.env.PATH?.split(path.delimiter) ?? [];
  return pathEntries.some((entry) => existsSync(path.join(entry, command)));
}

function createInventory(configDir: string | undefined, workspace: string | undefined, secretStore: SecretStore | undefined): ProfileInventory {
  const resolvedConfigDir = path.resolve(configDir ?? path.join(workspace ? path.resolve(workspace) : process.cwd(), ".tokenvalve"));
  return new ProfileInventory({
    configDir: resolvedConfigDir,
    store: secretStore ?? new MacOSKeychainSecretStore()
  });
}

function createIntentStore(configDir: string | undefined, workspace: string | undefined): HumanIntentStore {
  return new HumanIntentStore({
    configDir: resolveConfigDir(configDir, workspace)
  });
}

function createRecipeStore(configDir: string | undefined, workspace: string | undefined): RecipeStore {
  return new RecipeStore({
    configDir: resolveConfigDir(configDir, workspace)
  });
}

function resolveConfigDir(configDir: string | undefined, workspace: string | undefined): string {
  return path.resolve(configDir ?? path.join(workspace ? path.resolve(workspace) : process.cwd(), ".tokenvalve"));
}

function readActiveIntents(configDir: string | undefined, workspace: string | undefined) {
  return createIntentStore(configDir, workspace).list();
}

function normalizeRisk(value: string): RiskLevel {
  if (value === "read" || value === "write" || value === "dangerous" || value === "production_deploy" || value === "unknown") {
    return value;
  }
  throw new Error(`Unsupported risk: ${value}`);
}

function normalizeStatus(value: string): ProfileStatus {
  if (value === "draft" || value === "unverified" || value === "verified" || value === "expired" || value === "disabled") {
    return value;
  }
  throw new Error(`Unsupported profile status: ${value}`);
}

function normalizeLlmProvider(value: string): string {
  if (["openai", "anthropic", "gemini", "openrouter", "custom", "internal"].includes(value)) {
    return value;
  }
  throw new Error(`Unsupported LLM provider: ${value}`);
}

function normalizeGithubArgs(args: string[]): string[] {
  const normalized = args[0] === "--" ? args.slice(1) : args;
  if (normalized.length === 0) {
    throw new Error("GitHub command arguments are required after --.");
  }
  return normalized;
}

function normalizeSupabaseArgs(args: string[]): string[] {
  const normalized = args[0] === "--" ? args.slice(1) : args;
  if (normalized.length === 0) {
    throw new Error("Supabase command arguments are required after --.");
  }
  return normalized;
}

function normalizeVercelArgs(args: string[]): string[] {
  const normalized = args[0] === "--" ? args.slice(1) : args;
  if (normalized.length === 0) {
    throw new Error("Vercel command arguments are required after --.");
  }
  return normalized;
}

function normalizeOptionalPassthroughArgs(args: string[]): string[] | undefined {
  const normalized = args[0] === "--" ? args.slice(1) : args;
  return normalized.length > 0 ? normalized : undefined;
}

function parseKnownHostsPolicy(mode: string | undefined, file: string | undefined): KnownHostsPolicy | undefined {
  if (!mode) {
    return undefined;
  }
  if (mode === "strict") {
    return { mode, file: file ?? "" };
  }
  if (mode === "accept-new") {
    return file ? { mode, file } : { mode };
  }
  if (mode === "off") {
    return { mode };
  }
  throw new Error(`Unsupported known_hosts policy: ${mode}`);
}

function isLlmProfile(profile: ProfileMetadata): boolean {
  return Boolean(profile.llm) || ["openai", "anthropic", "gemini", "openrouter", "custom", "internal"].includes(profile.provider);
}

function readBindingsFromInventory(inventory: ProfileInventory) {
  return inventory.getBindings();
}

function createLlmAdapter(provider: string, profiles: ProfileMetadata[]): AdapterDefinition {
  const useCases = [...new Set(profiles
    .filter((profile) => profile.provider === provider)
    .flatMap((profile) => profile.useCases ?? []))];
  return {
    provider,
    capabilities: [{
      id: `${provider}-default`,
      type: "llm-api-key",
      provider,
      useCases: useCases.length > 0 ? useCases : undefined
    }],
    riskRules: [{ capability: `${provider}-default`, risk: "read" }]
  };
}

function createHttpCliAdapter(provider: string, capabilityId: string): AdapterDefinition {
  return {
    provider,
    capabilities: [{
      id: capabilityId,
      type: "http-request",
      allowedHosts: providerAllowedHosts(provider),
      pathPrefixes: ["/"],
      methods: ["GET"]
    }],
    riskRules: [{ capability: capabilityId, method: "GET", pathPrefix: "/", risk: "read" }]
  };
}

function createCurlCliAdapter(provider: string, capabilityId: string): AdapterDefinition {
  return {
    provider,
    capabilities: [{
      id: capabilityId,
      type: "curl-template",
      commands: ["curl"],
      allowedHosts: providerAllowedHosts(provider),
      pathPrefixes: ["/"],
      methods: ["GET"]
    }],
    riskRules: [{ capability: capabilityId, match: ["GET"], risk: "read" }]
  };
}

function providerAllowedHosts(provider: string): string[] {
  if (provider === "github") {
    return ["api.github.com"];
  }
  if (provider === "supabase") {
    return ["api.supabase.com"];
  }
  return [];
}

function parseHeaders(values: string[]): Record<string, string> {
  return Object.fromEntries(values.map((value) => {
    const separator = value.indexOf(":");
    if (separator <= 0) {
      throw new Error(`Header must be formatted as Name: value: ${value}`);
    }
    return [value.slice(0, separator).trim(), value.slice(separator + 1).trim()];
  }));
}

function formatInitResult(result: ReturnType<typeof runScenarioInit>, dryRun: boolean): string {
  const lines = [
    "TokenValve init",
    `- workspace: ${result.detections.workspace}`,
    `- git remote: ${result.detections.gitRemote ?? "not detected"}`,
    `- supabase config: ${result.detections.hasSupabaseConfig ? "detected" : "not detected"}`,
    `- vercel config: ${result.detections.hasVercelConfig ? "detected" : "not detected"}`,
    "- selected providers are explicit; unselected providers are not auto-managed",
    dryRun ? "- dry-run: no files written" : `- files written: ${result.writtenFiles.length}`,
    "",
    "Dry-run matrix:"
  ];

  for (const row of result.dryRunMatrix) {
    lines.push(
      `- ${row.label}: ${row.decision} (${row.reason}) provider=${row.provider} profile=${row.profile ?? "none"} risk=${row.risk ?? "none"}`
    );
  }

  return `${lines.join("\n")}\n`;
}

function formatSecretChanged(action: string, profile: { id: string; provider: string; environment?: string; status?: string }): string {
  return [
    "TokenValve secret",
    `- ${action}: ${profile.id}`,
    `- provider: ${profile.provider}`,
    `- environment: ${profile.environment ?? "not set"}`,
    `- status: ${profile.status ?? "unverified"}`,
    "- secret value: stored outside YAML and hidden from output"
  ].join("\n") + "\n";
}

function formatIntentChanged(action: string, intent: {
  id: string;
  status: string;
  source: string;
  expiresAt: string;
  scope: {
    workspace: string;
    provider: string;
    profile: string;
    environment: string;
    risk: string;
  };
}): string {
  return [
    "TokenValve human intent",
    `- ${action}: ${intent.id}`,
    `- status: ${intent.status}`,
    `- source: ${intent.source}`,
    `- workspace: ${intent.scope.workspace}`,
    `- provider: ${intent.scope.provider}`,
    `- profile: ${intent.scope.profile}`,
    `- environment: ${intent.scope.environment}`,
    `- risk: ${intent.scope.risk}`,
    `- expiresAt: ${intent.expiresAt}`,
    "- secret value: never stored in intent"
  ].join("\n") + "\n";
}

function formatRecipeList(recipes: Array<{
  id: string;
  status: string;
  binding: {
    provider: string;
    profile: string;
    capability: string;
    workspace: string;
  };
}>): string {
  const lines = ["TokenValve recipes"];
  if (recipes.length === 0) {
    lines.push("- none");
    return `${lines.join("\n")}\n`;
  }
  for (const recipe of recipes) {
    lines.push([
      `- ${recipe.id}`,
      `status=${recipe.status}`,
      `provider=${recipe.binding.provider}`,
      `profile=${recipe.binding.profile}`,
      `capability=${recipe.binding.capability}`,
      `workspace=${recipe.binding.workspace}`
    ].join(" "));
  }
  return `${lines.join("\n")}\n`;
}

function formatRecipeShow(recipe: {
  id: string;
  status: string;
  lastVerifiedAt?: string;
  binding: {
    workspace: string;
    provider: string;
    profile: string;
    environment?: string;
    capability: string;
  };
  validationResults?: Array<{ status: string; message: string }>;
}): string {
  const lines = [
    "TokenValve recipe",
    `- id: ${recipe.id}`,
    `- status: ${recipe.status}`,
    `- workspace: ${recipe.binding.workspace}`,
    `- provider: ${recipe.binding.provider}`,
    `- profile: ${recipe.binding.profile}`,
    `- environment: ${recipe.binding.environment ?? "none"}`,
    `- capability: ${recipe.binding.capability}`,
    `- lastVerifiedAt: ${recipe.lastVerifiedAt ?? "never"}`
  ];
  for (const result of recipe.validationResults ?? []) {
    lines.push(`- validation: ${result.status} ${result.message}`);
  }
  return `${lines.join("\n")}\n`;
}

function formatSecretList(profiles: Array<{
  id: string;
  provider: string;
  environment?: string;
  status?: string;
  useCases?: string[];
  boundWorkspaces?: string[];
  maskedFingerprint?: string;
}>): string {
  const lines = ["TokenValve secret profiles"];
  if (profiles.length === 0) {
    lines.push("- none");
    return `${lines.join("\n")}\n`;
  }

  for (const profile of profiles) {
    lines.push(
      [
        `- ${profile.id}`,
        `provider=${profile.provider}`,
        `environment=${profile.environment ?? "not-set"}`,
        `status=${profile.status ?? "unverified"}`,
        `useCases=${profile.useCases?.join(",") || "none"}`,
        `bindings=${profile.boundWorkspaces?.length ?? 0}`,
        `fingerprint=${profile.maskedFingerprint ?? "none"}`
      ].join(" ")
    );
  }
  return `${lines.join("\n")}\n`;
}

function formatLlmChanged(action: string, profile: ProfileMetadata): string {
  return [
    "TokenValve llm",
    `- ${action}: ${profile.id}`,
    `- provider: ${profile.provider}`,
    `- status: ${profile.status ?? "unverified"}`,
    `- model: ${profile.llm?.defaultModel ?? "not set"}`,
    `- baseUrl: ${profile.llm?.baseUrl ?? "not set"}`,
    "- api key: stored outside YAML and hidden from output"
  ].join("\n") + "\n";
}

function formatLlmList(profiles: ProfileMetadata[]): string {
  const lines = ["TokenValve llm profiles"];
  if (profiles.length === 0) {
    lines.push("- none");
    return `${lines.join("\n")}\n`;
  }

  for (const profile of profiles) {
    lines.push([
      `- ${profile.id}`,
      `provider=${profile.provider}`,
      `status=${profile.status ?? "unverified"}`,
      `model=${profile.llm?.defaultModel ?? "not-set"}`,
      `baseUrl=${profile.llm?.baseUrl ?? "not-set"}`,
      `useCases=${profile.useCases?.join(",") || "none"}`,
      `clients=${profile.llm?.clientLabels?.join(",") || "none"}`,
      `fingerprint=${profile.maskedFingerprint ?? "none"}`
    ].join(" "));
  }
  return `${lines.join("\n")}\n`;
}

function formatLlmResolve(result: ReturnType<typeof resolveContext>): string {
  return [
    "TokenValve llm resolve",
    `- decision: ${result.decision}`,
    `- reason: ${result.reason}`,
    `- provider: ${result.provider ?? "none"}`,
    `- profile: ${result.profile ?? "none"}`,
    `- capability: ${result.capability ?? "none"}`,
    `- risk: ${result.risk ?? "none"}`
  ].join("\n") + "\n";
}

function formatGithubRun(result: Awaited<ReturnType<typeof runGitHubCli>>): string {
  const lines = [
    "TokenValve github",
    `- decision: ${result.resolve.decision}`,
    `- reason: ${result.resolve.reason}`,
    `- provider: ${result.resolve.provider ?? "github"}`,
    `- profile: ${result.resolve.profile ?? "none"}`,
    `- risk: ${result.resolve.risk ?? "none"}`,
    `- executed: ${result.executed ? "yes" : "no"}`,
    `- exitCode: ${result.exitCode}`
  ];

  if (result.stdout) {
    lines.push("", "stdout:", result.stdout.replace(/\n$/, ""));
  }
  if (result.stderr) {
    lines.push("", "stderr:", result.stderr.replace(/\n$/, ""));
  }

  return `${lines.join("\n")}\n`;
}

function formatSupabaseRun(result: Awaited<ReturnType<typeof runSupabaseCli>>): string {
  const lines = [
    "TokenValve supabase",
    `- decision: ${result.resolve.decision}`,
    `- reason: ${result.resolve.reason}`,
    `- provider: ${result.resolve.provider ?? "supabase"}`,
    `- profile: ${result.resolve.profile ?? "none"}`,
    `- environment: ${result.resolve.environment ?? "none"}`,
    `- risk: ${result.resolve.risk ?? "none"}`,
    `- executed: ${result.executed ? "yes" : "no"}`,
    `- exitCode: ${result.exitCode}`
  ];

  if (result.stdout) {
    lines.push("", "stdout:", result.stdout.replace(/\n$/, ""));
  }
  if (result.stderr) {
    lines.push("", "stderr:", result.stderr.replace(/\n$/, ""));
  }

  return `${lines.join("\n")}\n`;
}

function formatHttpRun(result: Awaited<ReturnType<typeof runHttpRequest>>): string {
  return [
    "TokenValve http",
    `- decision: ${result.resolve.decision}`,
    `- reason: ${result.resolve.reason}`,
    `- provider: ${result.resolve.provider ?? "none"}`,
    `- profile: ${result.resolve.profile ?? "none"}`,
    `- risk: ${result.resolve.risk ?? "none"}`,
    `- executed: ${result.executed ? "yes" : "no"}`,
    `- status: ${result.status}`,
    "",
    "body:",
    result.body.replace(/\n$/, "")
  ].join("\n") + "\n";
}

function formatCurlRun(result: Awaited<ReturnType<typeof runCurlTemplate>>): string {
  const lines = [
    "TokenValve curl",
    `- decision: ${result.resolve.decision}`,
    `- reason: ${result.resolve.reason}`,
    `- provider: ${result.resolve.provider ?? "none"}`,
    `- profile: ${result.resolve.profile ?? "none"}`,
    `- risk: ${result.resolve.risk ?? "none"}`,
    `- executed: ${result.executed ? "yes" : "no"}`,
    `- exitCode: ${result.exitCode}`
  ];
  if (result.stdout) {
    lines.push("", "stdout:", result.stdout.replace(/\n$/, ""));
  }
  if (result.stderr) {
    lines.push("", "stderr:", result.stderr.replace(/\n$/, ""));
  }
  return `${lines.join("\n")}\n`;
}

function formatSshRun(label: "ssh" | "git-ssh", result: Awaited<ReturnType<typeof runSshCommand>>): string {
  const lines = [
    `TokenValve ${label}`,
    `- decision: ${result.resolve.decision}`,
    `- reason: ${result.resolve.reason}`,
    `- provider: ${result.resolve.provider ?? "none"}`,
    `- profile: ${result.resolve.profile ?? "none"}`,
    `- environment: ${result.resolve.environment ?? "none"}`,
    `- risk: ${result.resolve.risk ?? "none"}`,
    `- executed: ${result.executed ? "yes" : "no"}`,
    `- exitCode: ${result.exitCode}`
  ];
  if (result.stdout) {
    lines.push("", "stdout:", result.stdout.replace(/\n$/, ""));
  }
  if (result.stderr) {
    lines.push("", "stderr:", result.stderr.replace(/\n$/, ""));
  }
  return `${lines.join("\n")}\n`;
}

function formatVercelRun(result: Awaited<ReturnType<typeof runVercelCli>>): string {
  const lines = [
    "TokenValve vercel",
    `- decision: ${result.resolve.decision}`,
    `- reason: ${result.resolve.reason}`,
    `- provider: ${result.resolve.provider ?? "vercel"}`,
    `- profile: ${result.resolve.profile ?? "none"}`,
    `- environment: ${result.resolve.environment ?? "none"}`,
    `- risk: ${result.resolve.risk ?? "none"}`,
    `- executed: ${result.executed ? "yes" : "no"}`,
    `- exitCode: ${result.exitCode}`
  ];

  if (result.stdout) {
    lines.push("", "stdout:", result.stdout.replace(/\n$/, ""));
  }
  if (result.stderr) {
    lines.push("", "stderr:", result.stderr.replace(/\n$/, ""));
  }

  return `${lines.join("\n")}\n`;
}
