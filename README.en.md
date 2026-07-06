# TokenValve

TokenValve is a local secret manager, credential broker, and execution gateway for AI coding agents and developer CLIs.

It helps Codex, Claude Code, Pi Agent, local scripts, HTTP requests, SSH, and provider CLIs use the right local credential for the current workspace without handing raw secrets to the agent, writing `.env` files into projects, or relying on global auth state.

## What It Is

- A macOS-first local CLI and library for profile-based credential routing.
- A per-execution broker for GitHub, Supabase, Vercel, HTTP/curl, SSH/git-over-SSH, LLM API keys, and custom providers.
- A safety layer for production writes through local human intent grants.
- A redacted dashboard and doctor for understanding local state.
- A foundation for MCP tools and Skill onboarding flows.

## What It Is Not

- Not a cloud vault or team secret sharing service.
- Not a full replacement for 1Password, Bitwarden, Vault, or macOS Keychain.
- Not a sandbox for a malicious agent with arbitrary local command execution.
- Not a Web UI in the MVP.

## Requirements

- macOS
- Node.js 22+
- pnpm
- Optional provider CLIs depending on your workflows: `gh`, `supabase`, `vercel`, `ssh`, `git`, `curl`

## Install From Source

```bash
git clone https://github.com/ThindoLab/token-valve.git
cd token-valve
pnpm install
pnpm build
node packages/cli/dist/index.js doctor --workspace "$PWD" --config-dir "$PWD/.tokenvalve"
```

For local development, you can run commands through:

```bash
node packages/cli/dist/index.js --help
```

## Quick Start

Initialize a workspace with explicit providers:

```bash
node packages/cli/dist/index.js init \
  --workspace "$PWD" \
  --config-dir "$PWD/.tokenvalve" \
  --provider github \
  --provider supabase \
  --provider vercel \
  --llm-key openai-work \
  --yes
```

Add a GitHub profile. Use your real token only in the CLI/local input path, never in an agent prompt:

```bash
node packages/cli/dist/index.js secret add \
  --config-dir "$PWD/.tokenvalve" \
  --workspace "$PWD" \
  --profile github-personal \
  --provider github \
  --environment development \
  --secret-value "<github-token>" \
  --yes
```

Verify the profile:

```bash
node packages/cli/dist/index.js secret test github-personal \
  --config-dir "$PWD/.tokenvalve"
```

Run a safe GitHub command with per-execution credential injection:

```bash
node packages/cli/dist/index.js github run \
  --workspace "$PWD" \
  --config-dir "$PWD/.tokenvalve" \
  -- repo view
```

Open the redacted dashboard:

```bash
node packages/cli/dist/index.js dashboard \
  --workspace "$PWD" \
  --config-dir "$PWD/.tokenvalve"
```

Open the local Web key manager:

```bash
node packages/cli/dist/index.js dashboard web \
  --workspace "$PWD" \
  --config-dir "$PWD/.tokenvalve" \
  --port 4777
```

Run doctor when something fails:

```bash
node packages/cli/dist/index.js doctor \
  --workspace "$PWD" \
  --config-dir "$PWD/.tokenvalve"
```

## Provider Examples

See [docs/provider-examples.md](docs/provider-examples.md) for GitHub, Supabase, Vercel, LLM, HTTP/curl, SSH, and custom provider examples.

## MCP And Skills

See [docs/mcp-and-skills.md](docs/mcp-and-skills.md) for MCP tool boundaries and Skill onboarding examples.

The short version:

- MCP is the capability boundary.
- Skill is the orchestration layer.
- Secrets should enter through local controlled input, not through agent chat.
- Verified Recipe metadata can be reused by later agents.

## Recipes

Examples live in [recipes/examples](recipes/examples).

Recipe files describe provider/profile/capability/workspace/risk/validation metadata. They must not contain raw secrets.

## Production Writes

Production write and dangerous operations require explicit local human intent:

```bash
node packages/cli/dist/index.js use \
  --workspace "$PWD" \
  --provider vercel \
  --profile vercel-prod \
  --environment production \
  --risk production_deploy \
  --ttl 10m \
  --yes
```

## Security Boundary

Read [docs/threat-model.md](docs/threat-model.md).

TokenValve reduces accidental leakage, wrong-profile execution, global auth state races, and unconfirmed production writes. It does not claim to contain a hostile local agent that can run arbitrary commands.

## Known Limitations And Backlog

Read [docs/known-limitations.md](docs/known-limitations.md).

Highlights:

- macOS-first MVP.
- Source install only.
- No full Web UI yet.
- No team cloud vault.
- No hostile-agent sandbox.

## Development

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
pnpm lint
```
