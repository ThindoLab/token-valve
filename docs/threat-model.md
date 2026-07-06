# Threat Model And Security Boundary

TokenValve is designed to reduce accidental credential misuse in local AI-assisted development workflows.

## In Scope

TokenValve aims to reduce:

- Raw secrets appearing in agent prompts, logs, MCP results, YAML config, or audit output.
- Wrong account/profile selection for a workspace.
- Global CLI auth state races between concurrent agents.
- Unconfirmed production writes and dangerous operations.
- Accidental shell-string execution with credentials.
- Unclear failure paths when configuration is missing or unsafe.

## Out Of Scope For MVP

TokenValve does not claim to stop:

- A malicious local agent that can execute arbitrary commands.
- A compromised operating system account.
- A user intentionally copying secrets into chat.
- A provider CLI that leaks secrets internally.
- Team-wide secret sharing, rotation, or policy enforcement.
- Cloud-hosted vault use cases.

## Core Controls

- Per-execution credential injection.
- Session/workspace/profile resolution.
- Fail-closed resolver behavior.
- Secret redaction in returns and audit-shaped output.
- Human intent for production writes and dangerous operations.
- Global switch only through explicit opt-in, lock, TTL, snapshot, restore, and audit.
- Doctor diagnostics for common unsafe states.

## Secret Storage

MVP is macOS-first and uses a local secret store abstraction with macOS Keychain as the intended backend.

YAML files store metadata only:

- profile id
- provider
- environment
- workspace binding
- risk rules
- Recipe validation metadata

YAML files must not store raw tokens, API keys, private keys, or Bearer credentials.

## Global Auth State

Default execution must not call commands like `gh auth switch`, `supabase login`, or `vercel login`.

Global-switch compatibility exists only for providers that explicitly opt in and need it. Lock conflicts fail closed.

## Production Writes

Production write, dangerous, and production deploy operations require local human intent.

Intent grants are scoped by workspace, provider, profile, environment, risk, and TTL.

## Reporting A Security Issue

This repo is currently an MVP. Until a dedicated security policy exists, avoid posting real secrets in issues or discussions. Share minimal reproduction steps with placeholders.
