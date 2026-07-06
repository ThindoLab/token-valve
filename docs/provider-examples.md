# Provider Examples

All examples use placeholder values such as `<github-token>` or `<api-token>`. Do not paste real secrets into agent chat. Use local CLI input, future dashboard input, or another local controlled channel.

## GitHub

```bash
tokenvalve secret add \
  --config-dir "$PWD/.tokenvalve" \
  --workspace "$PWD" \
  --profile github-personal \
  --provider github \
  --environment development \
  --secret-value "<github-token>" \
  --yes

tokenvalve secret test github-personal --config-dir "$PWD/.tokenvalve"

tokenvalve github run \
  --workspace "$PWD" \
  --config-dir "$PWD/.tokenvalve" \
  -- repo view
```

Concurrent agents can use session-scoped profile overrides without changing global `gh` auth state:

```bash
tokenvalve github run \
  --workspace "$PWD" \
  --config-dir "$PWD/.tokenvalve" \
  --session-id agent-a \
  --client codex \
  --profile github-personal \
  -- repo view
```

## Supabase

```bash
tokenvalve secret add \
  --config-dir "$PWD/.tokenvalve" \
  --workspace "$PWD" \
  --profile supabase-staging \
  --provider supabase \
  --environment staging \
  --secret-value "<supabase-access-token>" \
  --yes

tokenvalve supabase run \
  --workspace "$PWD" \
  --config-dir "$PWD/.tokenvalve" \
  -- projects list
```

Structured HTTP requests can use secret templates without shell strings:

```bash
tokenvalve http request \
  --workspace "$PWD" \
  --config-dir "$PWD/.tokenvalve" \
  --provider supabase \
  --method GET \
  --url "https://api.supabase.com/v1/projects" \
  --secret-header "Authorization: Bearer {{token}}"
```

## Vercel

```bash
tokenvalve secret add \
  --config-dir "$PWD/.tokenvalve" \
  --workspace "$PWD" \
  --profile vercel-preview \
  --provider vercel \
  --environment preview \
  --secret-value "<vercel-token>" \
  --yes

tokenvalve vercel run \
  --workspace "$PWD" \
  --config-dir "$PWD/.tokenvalve" \
  -- deploy
```

Production deploys require local human intent:

```bash
tokenvalve use \
  --workspace "$PWD" \
  --provider vercel \
  --profile vercel-prod \
  --environment production \
  --risk production_deploy \
  --ttl 10m \
  --yes
```

## LLM Keys

```bash
tokenvalve llm add \
  --config-dir "$PWD/.tokenvalve" \
  --workspace "$PWD" \
  --profile openai-work \
  --provider openai \
  --api-key "<llm-api-key>" \
  --use-case code-generation \
  --use-case review \
  --model gpt-5 \
  --yes

tokenvalve llm resolve \
  --workspace "$PWD" \
  --config-dir "$PWD/.tokenvalve" \
  --provider openai \
  --client codex \
  --use-case code-generation
```

## SSH And Git Over SSH

```bash
tokenvalve secret add \
  --config-dir "$PWD/.tokenvalve" \
  --workspace "$PWD" \
  --profile github-ssh \
  --provider github \
  --environment development \
  --field identity_file \
  --secret-value "<path-to-identity-file>" \
  --yes

tokenvalve git-ssh run \
  --workspace "$PWD" \
  --config-dir "$PWD/.tokenvalve" \
  --provider github \
  --remote-url "git@github.com:ThindoLab/token-valve.git" \
  --operation fetch \
  --known-hosts-policy strict \
  --known-hosts-file "$HOME/.ssh/known_hosts"
```

## Custom Provider

Create a secret profile:

```bash
tokenvalve secret add \
  --config-dir "$PWD/.tokenvalve" \
  --workspace "$PWD" \
  --profile internal-api-default \
  --provider internal-api \
  --environment development \
  --secret-value "<api-token>" \
  --yes
```

Declare an HTTP mapping:

```bash
tokenvalve custom add-http \
  --config-dir "$PWD/.tokenvalve" \
  --provider internal-api \
  --capability internal-status \
  --host internal.example.test \
  --path-prefix /status \
  --method GET \
  --secret-header "Authorization: Bearer {{token}}" \
  --risk read
```

Run the request:

```bash
tokenvalve http request \
  --workspace "$PWD" \
  --config-dir "$PWD/.tokenvalve" \
  --provider internal-api \
  --capability internal-status \
  --method GET \
  --url "https://internal.example.test/status/health"
```

Custom script mapping:

```bash
tokenvalve custom add-script \
  --config-dir "$PWD/.tokenvalve" \
  --provider internal-tool \
  --capability internal-script \
  --script "$PWD/scripts/internal-tool" \
  --env "INTERNAL_TOKEN={{token}}" \
  --risk read

tokenvalve custom script run \
  --workspace "$PWD" \
  --config-dir "$PWD/.tokenvalve" \
  --provider internal-tool \
  --capability internal-script \
  --script "$PWD/scripts/internal-tool"
```
