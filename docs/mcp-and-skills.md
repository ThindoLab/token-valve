# MCP And Skills

TokenValve separates capability execution from conversational orchestration.

- MCP tools are the capability boundary.
- Skills guide onboarding, ask clarifying questions, call MCP, and save verified Recipes.
- Skills must not receive raw secrets or read the secret store directly.

## MCP Client Configuration

Build the repo first:

```bash
pnpm install
pnpm build
```

Point your MCP-compatible client at the server package entry:

```json
{
  "mcpServers": {
    "tokenvalve": {
      "command": "node",
      "args": ["./packages/mcp-server/dist/index.js"],
      "env": {
        "TOKENVALVE_CONFIG_DIR": "<absolute-path-to-config-dir>"
      }
    }
  }
}
```

Exact client config paths differ by host. Keep the config local to your machine.

## MCP Tool Boundary

MCP exposes structured tools such as:

- `profiles_list`
- `context_resolve`
- `llm_profile_resolve`
- `exec_with_secrets`
- `http_request_with_secrets`
- `ssh_with_secrets`
- `intent_request`
- `secret_profile_create`
- `secret_profile_test`
- `recipe_save`
- `recipe_list`
- `audit_list`

Execution tools accept structured arguments, not shell strings.

## Skill Onboarding Example

User intent:

```text
新增一个 GitHub key，给当前 workspace 用。
```

Skill behavior:

1. Identify provider: `github`.
2. Ask for profile name if missing, for example `github-personal`.
3. Confirm workspace binding and capability.
4. Ask the user to enter the token through local TokenValve input, not in chat.
5. Call MCP `secret_profile_create` with metadata only.
6. Call MCP `secret_profile_test`.
7. Save a verified Recipe only after validation passes.

Failed validation must not create a verified Recipe.

## Safe Prompt Pattern

Use:

```text
I will open TokenValve local input for the secret. Do not paste the key in chat.
```

Avoid:

```text
Paste your API key here.
```

## Recipe Reuse

After a verified Recipe exists, later agents can resolve the same workspace/capability without relying on chat history.

The Recipe stores metadata, validation status, risk rules, and binding information. It does not store raw secret values.
