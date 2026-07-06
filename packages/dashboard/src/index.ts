import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type {
  CustomProviderMapping,
  HumanIntentGrant,
  ProfileMetadata,
  TokenValveRecipe,
  WorkspaceBinding
} from "@tokenvalve/core";

export const tokenValveDashboardPackage = "@tokenvalve/dashboard";

export interface DashboardSnapshot {
  workspace: string;
  profiles: ProfileMetadata[];
  bindings: WorkspaceBinding[];
  intents: HumanIntentGrant[];
  recipes: TokenValveRecipe[];
  customProviders: CustomProviderMapping[];
  doctor: {
    status: "ok" | "warning" | "error";
    message: string;
  };
  audits?: {
    available: boolean;
    summary: string[];
  };
}

export interface DashboardWebServerOptions {
  host: string;
  port: number;
  loadSnapshot: () => DashboardSnapshot;
  switchDefaultProfile: (input: { workspace: string; provider: string; profile: string }) => { profile: string; environment?: string };
}

export interface DashboardWebServer {
  url: string;
  server: Server;
  close: () => Promise<void>;
}

export function getDashboardStatus(): string {
  return "dashboard renderer ready";
}

export function renderDashboard(snapshot: DashboardSnapshot): string {
  const lines = [
    "TokenValve dashboard",
    `Workspace: ${sanitize(snapshot.workspace)}`,
    "",
    "Workspace bindings:",
    ...formatBindings(snapshot.bindings),
    "",
    "Profiles:",
    ...formatProfiles(snapshot.profiles),
    "",
    "Active intents:",
    ...formatIntents(snapshot.intents),
    "",
    "Recipes:",
    ...formatRecipes(snapshot.recipes),
    "",
    "Custom providers:",
    ...formatCustomProviders(snapshot.customProviders),
    "",
    "Audit:",
    ...formatAudit(snapshot.audits),
    "",
    "Doctor:",
    `- ${snapshot.doctor.status}: ${sanitize(snapshot.doctor.message)}`
  ];

  return `${lines.join("\n")}\n`;
}

export function renderDashboardUseResult(input: { workspace: string; provider: string; profile: string; environment?: string }): string {
  return [
    "TokenValve dashboard use",
    `- workspace: ${sanitize(input.workspace)}`,
    `- provider: ${sanitize(input.provider)}`,
    `- profile: ${sanitize(input.profile)}`,
    `- environment: ${sanitize(input.environment ?? "none")}`,
    "- secret value: not displayed",
    "- global auth state: unchanged"
  ].join("\n") + "\n";
}

export async function startDashboardWebServer(options: DashboardWebServerOptions): Promise<DashboardWebServer> {
  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? "/", `http://${options.host}:${options.port}`);
    try {
      if (request.method === "GET" && requestUrl.pathname === "/") {
        const snapshot = options.loadSnapshot();
        send(response, 200, "text/html; charset=utf-8", renderDashboardHtml(snapshot));
        return;
      }
      if (request.method === "GET" && requestUrl.pathname === "/api/snapshot") {
        sendJson(response, 200, sanitizeJson(options.loadSnapshot()));
        return;
      }
      if (request.method === "POST" && requestUrl.pathname === "/api/default-profile") {
        const body = await readRequestBody(request);
        const parsed = new URLSearchParams(body);
        const result = options.switchDefaultProfile({
          workspace: parsed.get("workspace") ?? "",
          provider: parsed.get("provider") ?? "",
          profile: parsed.get("profile") ?? ""
        });
        sendJson(response, 200, sanitizeJson({ ok: true, result }));
        return;
      }
      sendJson(response, 404, { ok: false, error: "not_found" });
    } catch (error) {
      sendJson(response, 500, { ok: false, error: sanitize(error instanceof Error ? error.message : String(error)) });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : options.port;
  return {
    url: `http://${options.host}:${port}`,
    server,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

export function renderDashboardHtml(snapshot: DashboardSnapshot): string {
  const safe = sanitizeSnapshot(snapshot);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>TokenValve 密钥管理器</title>
  <style>
    :root { color-scheme: light; --ink:#172026; --muted:#66737f; --line:#d8dee4; --panel:#ffffff; --bg:#f5f7f9; --ok:#176f3d; --warn:#9a6700; --err:#b42318; --accent:#1358d8; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--ink); background: var(--bg); }
    header { padding: 24px 28px 16px; background: #ffffff; border-bottom: 1px solid var(--line); }
    h1 { margin: 0 0 6px; font-size: 26px; letter-spacing: 0; }
    h2 { margin: 0 0 12px; font-size: 17px; letter-spacing: 0; }
    p { margin: 0; color: var(--muted); }
    main { padding: 20px 28px 36px; display: grid; gap: 16px; grid-template-columns: repeat(12, 1fr); }
    section { grid-column: span 6; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 16px; min-width: 0; }
    section.wide { grid-column: span 12; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { padding: 9px 8px; border-top: 1px solid var(--line); text-align: left; vertical-align: top; overflow-wrap: anywhere; }
    th { color: var(--muted); font-weight: 600; }
    .pill { display: inline-flex; align-items: center; min-height: 24px; padding: 2px 8px; border-radius: 999px; background: #eef2f6; color: #33404c; font-size: 12px; }
    .ok { color: var(--ok); } .warning { color: var(--warn); } .error { color: var(--err); }
    .empty { color: var(--muted); padding: 8px 0; }
    form { display: grid; gap: 10px; grid-template-columns: repeat(4, minmax(0, 1fr)); align-items: end; }
    label { display: grid; gap: 5px; color: var(--muted); font-size: 13px; }
    input { width: 100%; border: 1px solid var(--line); border-radius: 6px; padding: 9px 10px; font: inherit; background: #fff; }
    button { border: 0; border-radius: 6px; padding: 10px 12px; background: var(--accent); color: white; font-weight: 650; cursor: pointer; }
    code { background: #eef2f6; border-radius: 4px; padding: 1px 4px; }
    @media (max-width: 900px) { main { padding: 14px; } section, section.wide { grid-column: span 12; } form { grid-template-columns: 1fr; } header { padding: 18px 14px 12px; } }
  </style>
</head>
<body>
  <header>
    <h1>TokenValve 密钥管理器</h1>
    <p>Workspace: <code>${escapeHtml(safe.workspace)}</code></p>
    <p>Doctor: <strong class="${safe.doctor.status}">${escapeHtml(safe.doctor.status)}</strong> · ${escapeHtml(safe.doctor.message)}</p>
  </header>
  <main>
    <section class="wide">
      <h2>默认 Profile 切换</h2>
      <form method="post" action="/api/default-profile">
        <input type="hidden" name="workspace" value="${escapeHtml(safe.workspace)}">
        <label>Provider<input name="provider" placeholder="github"></label>
        <label>Profile<input name="profile" placeholder="github-personal"></label>
        <label>Workspace<input value="${escapeHtml(safe.workspace)}" disabled></label>
        <button type="submit">安全切换</button>
      </form>
    </section>
    <section>${bindingsHtml(safe.bindings)}</section>
    <section>${profilesHtml(safe.profiles)}</section>
    <section>${intentsHtml(safe.intents)}</section>
    <section>${recipesHtml(safe.recipes)}</section>
    <section>${customProvidersHtml(safe.customProviders)}</section>
    <section>${doctorHtml(safe.doctor)}</section>
  </main>
</body>
</html>`;
}

function formatBindings(bindings: WorkspaceBinding[]): string[] {
  if (bindings.length === 0) {
    return ["- none configured"];
  }
  return bindings.flatMap((binding) => [
    `- ${sanitize(binding.path)}`,
    ...Object.entries(binding.providers).map(([provider, value]) =>
      `  - ${sanitize(provider)} -> ${sanitize(value.profile)} (${sanitize(value.environment ?? "environment not set")})`
    )
  ]);
}

function formatProfiles(profiles: ProfileMetadata[]): string[] {
  if (profiles.length === 0) {
    return ["- none configured"];
  }
  return profiles.map((profile) => [
    `- ${sanitize(profile.id)}`,
    `provider=${sanitize(profile.provider)}`,
    `status=${sanitize(profile.status ?? "unverified")}`,
    `environment=${sanitize(profile.environment ?? "none")}`,
    profile.maskedFingerprint ? `fingerprint=${sanitize(profile.maskedFingerprint)}` : undefined,
    profile.llm ? "llm=yes" : undefined
  ].filter(Boolean).join(" "));
}

function formatIntents(intents: HumanIntentGrant[]): string[] {
  const active = intents.filter((intent) => intent.status === "active");
  if (active.length === 0) {
    return ["- none active"];
  }
  return active.map((intent) =>
    `- ${sanitize(intent.id)} provider=${sanitize(intent.scope.provider)} profile=${sanitize(intent.scope.profile)} risk=${sanitize(intent.scope.risk)} expiresAt=${sanitize(intent.expiresAt)}`
  );
}

function formatRecipes(recipes: TokenValveRecipe[]): string[] {
  if (recipes.length === 0) {
    return ["- none saved"];
  }
  return recipes.map((recipe) =>
    `- ${sanitize(recipe.id)} status=${sanitize(recipe.status)} provider=${sanitize(recipe.binding.provider)} profile=${sanitize(recipe.binding.profile)} capability=${sanitize(recipe.binding.capability)}`
  );
}

function formatCustomProviders(providers: CustomProviderMapping[]): string[] {
  if (providers.length === 0) {
    return ["- none configured"];
  }
  return providers.flatMap((provider) => [
    `- ${sanitize(provider.provider)}`,
    ...provider.capabilities.map((capability) =>
      `  - ${sanitize(capability.id)} type=${sanitize(capability.type)} riskRules=${capability.riskRules.length}`
    )
  ]);
}

function formatAudit(audits: DashboardSnapshot["audits"]): string[] {
  if (!audits?.available) {
    return ["- no persistent audit source yet"];
  }
  if (audits.summary.length === 0) {
    return ["- no recent audit events"];
  }
  return audits.summary.map((entry) => `- ${sanitize(entry)}`);
}

function sanitize(value: string): string {
  return value
    .replace(/gh[pousr]_[a-z0-9_]+/gi, "[REDACTED]")
    .replace(/github_pat_[a-z0-9_]+/gi, "[REDACTED]")
    .replace(/sk-[a-z0-9_-]+/gi, "[REDACTED]")
    .replace(/Bearer\s+[a-z0-9._-]+/gi, "Bearer [REDACTED]")
    .replace(/-----BEGIN [\s\S]+?-----END [^-]+-----/g, "[REDACTED_PRIVATE_KEY]");
}

function sanitizeSnapshot(snapshot: DashboardSnapshot): DashboardSnapshot {
  return sanitizeJson(snapshot) as DashboardSnapshot;
}

function sanitizeJson(value: unknown): unknown {
  if (typeof value === "string") {
    return sanitize(value);
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeJson);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, sanitizeJson(entry)]));
  }
  return value;
}

function bindingsHtml(bindings: WorkspaceBinding[]): string {
  return `<h2>Workspace Bindings</h2>${bindings.length === 0 ? empty() : `<table><thead><tr><th>Workspace</th><th>Provider</th><th>Profile</th><th>Environment</th></tr></thead><tbody>${bindings.flatMap((binding) => Object.entries(binding.providers).map(([provider, value]) => `<tr><td>${escapeHtml(binding.path)}</td><td>${escapeHtml(provider)}</td><td>${escapeHtml(value.profile)}</td><td>${escapeHtml(value.environment ?? "none")}</td></tr>`)).join("")}</tbody></table>`}`;
}

function profilesHtml(profiles: ProfileMetadata[]): string {
  return `<h2>Profiles</h2>${profiles.length === 0 ? empty() : `<table><thead><tr><th>Profile</th><th>Provider</th><th>Status</th><th>Environment</th><th>Fingerprint</th></tr></thead><tbody>${profiles.map((profile) => `<tr><td>${escapeHtml(profile.id)}</td><td>${escapeHtml(profile.provider)}</td><td><span class="pill">${escapeHtml(profile.status ?? "unverified")}</span></td><td>${escapeHtml(profile.environment ?? "none")}</td><td>${escapeHtml(profile.maskedFingerprint ?? "none")}</td></tr>`).join("")}</tbody></table>`}`;
}

function intentsHtml(intents: HumanIntentGrant[]): string {
  const active = intents.filter((intent) => intent.status === "active");
  return `<h2>Active Intents</h2>${active.length === 0 ? empty("none active") : `<table><thead><tr><th>ID</th><th>Provider</th><th>Profile</th><th>Risk</th><th>Expires</th></tr></thead><tbody>${active.map((intent) => `<tr><td>${escapeHtml(intent.id)}</td><td>${escapeHtml(intent.scope.provider)}</td><td>${escapeHtml(intent.scope.profile)}</td><td>${escapeHtml(intent.scope.risk)}</td><td>${escapeHtml(intent.expiresAt)}</td></tr>`).join("")}</tbody></table>`}`;
}

function recipesHtml(recipes: TokenValveRecipe[]): string {
  return `<h2>Recipes</h2>${recipes.length === 0 ? empty("none saved") : `<table><thead><tr><th>ID</th><th>Status</th><th>Provider</th><th>Profile</th><th>Capability</th></tr></thead><tbody>${recipes.map((recipe) => `<tr><td>${escapeHtml(recipe.id)}</td><td>${escapeHtml(recipe.status)}</td><td>${escapeHtml(recipe.binding.provider)}</td><td>${escapeHtml(recipe.binding.profile)}</td><td>${escapeHtml(recipe.binding.capability)}</td></tr>`).join("")}</tbody></table>`}`;
}

function customProvidersHtml(providers: CustomProviderMapping[]): string {
  return `<h2>Custom Providers</h2>${providers.length === 0 ? empty() : `<table><thead><tr><th>Provider</th><th>Capability</th><th>Type</th><th>Risk Rules</th></tr></thead><tbody>${providers.flatMap((provider) => provider.capabilities.map((capability) => `<tr><td>${escapeHtml(provider.provider)}</td><td>${escapeHtml(capability.id)}</td><td>${escapeHtml(capability.type)}</td><td>${capability.riskRules.length}</td></tr>`)).join("")}</tbody></table>`}`;
}

function doctorHtml(doctor: DashboardSnapshot["doctor"]): string {
  return `<h2>Doctor</h2><p><strong class="${escapeHtml(doctor.status)}">${escapeHtml(doctor.status)}</strong></p><p>${escapeHtml(doctor.message)}</p>`;
}

function empty(message = "none configured"): string {
  return `<p class="empty">${escapeHtml(message)}</p>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function send(response: ServerResponse, status: number, contentType: string, body: string): void {
  response.writeHead(status, { "content-type": contentType, "cache-control": "no-store" });
  response.end(body);
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  send(response, status, "application/json; charset=utf-8", JSON.stringify(body));
}

function readRequestBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("error", reject);
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}
