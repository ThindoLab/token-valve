export interface RedactionFinding {
  type:
    | "known-secret"
    | "authorization-header"
    | "url-query"
    | "github-token"
    | "openai-token"
    | "anthropic-token"
    | "jwt"
    | "generic-token"
    | "ssh-remote"
    | "ssh-agent-socket"
    | "ssh-identity-file";
  replacement: string;
}

export interface RedactionOptions {
  knownSecrets?: string[];
  minKnownSecretLength?: number;
}

export interface RedactionResult {
  text: string;
  findings: RedactionFinding[];
}

export interface ReturnRedactionOptions extends RedactionOptions {
  maxLength?: number;
}

export interface ReturnRedactionResult extends RedactionResult {
  truncated: boolean;
  safeToReturn: boolean;
}

const DEFAULT_MIN_SECRET_LENGTH = 8;
const DEFAULT_MAX_RETURN_LENGTH = 8_000;

const PATTERNS: Array<{ type: RedactionFinding["type"]; pattern: RegExp; replacement: string }> = [
  {
    type: "authorization-header",
    pattern: /\b(Authorization\s*:\s*(?:Bearer|Token|Basic)\s+)[^\s"'`]+/gi,
    replacement: "$1[REDACTED:authorization]"
  },
  {
    type: "github-token",
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/g,
    replacement: "[REDACTED:github-token]"
  },
  {
    type: "anthropic-token",
    pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
    replacement: "[REDACTED:anthropic-token]"
  },
  {
    type: "openai-token",
    pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g,
    replacement: "[REDACTED:openai-token]"
  },
  {
    type: "jwt",
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    replacement: "[REDACTED:jwt]"
  },
  {
    type: "url-query",
    pattern: /([?&](?:access_token|api_key|token|key|secret)=)([^&#\s]+)/gi,
    replacement: "$1[REDACTED:url-query]"
  },
  {
    type: "ssh-agent-socket",
    pattern: /\b(SSH_AUTH_SOCK=)(\/[^\s"'`]+)/g,
    replacement: "$1[REDACTED:ssh-agent-socket]"
  },
  {
    type: "ssh-identity-file",
    pattern: /(\s-i\s+)(\/[^\s"'`]+)/g,
    replacement: "$1[REDACTED:ssh-identity-file]"
  },
  {
    type: "ssh-remote",
    pattern: /\bgit@([^:\s]+):([^\s]+)\b/g,
    replacement: "git@$1:[REDACTED:ssh-remote]"
  },
  {
    type: "generic-token",
    pattern: /\b(?:token|api[_-]?key|secret)[=:]\s*([A-Za-z0-9_.-]{16,})\b/gi,
    replacement: "[REDACTED:generic-token]"
  }
];

export function redactText(text: string, options: RedactionOptions = {}): RedactionResult {
  const findings: RedactionFinding[] = [];
  let redacted = text;

  for (const secret of normalizeKnownSecrets(options)) {
    if (!redacted.includes(secret)) {
      continue;
    }

    redacted = redacted.split(secret).join("[REDACTED:known-secret]");
    findings.push({ type: "known-secret", replacement: "[REDACTED:known-secret]" });
  }

  for (const { type, pattern, replacement } of PATTERNS) {
    redacted = redacted.replace(pattern, (...args: unknown[]) => {
      findings.push({ type, replacement: replacement.replace(/\$\d/g, "") || replacement });
      return String(args[0]).replace(pattern, replacement);
    });
  }

  return { text: redacted, findings: uniqueFindings(findings) };
}

export function redactForReturn(text: string, options: ReturnRedactionOptions = {}): ReturnRedactionResult {
  const maxLength = options.maxLength ?? DEFAULT_MAX_RETURN_LENGTH;
  const redacted = redactText(text, options);
  const truncated = redacted.text.length > maxLength;

  if (!truncated) {
    return {
      ...redacted,
      truncated: false,
      safeToReturn: true
    };
  }

  return {
    text: `${redacted.text.slice(0, maxLength)}\n[TRUNCATED:unsafe-output]`,
    findings: redacted.findings,
    truncated: true,
    safeToReturn: false
  };
}

export function redactJsonValue<T>(value: T, options: RedactionOptions = {}): T {
  if (typeof value === "string") {
    return redactText(value, options).text as T;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactJsonValue(entry, options)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, redactJsonValue(entry, options)])
    ) as T;
  }

  return value;
}

function normalizeKnownSecrets(options: RedactionOptions): string[] {
  const minLength = options.minKnownSecretLength ?? DEFAULT_MIN_SECRET_LENGTH;
  return [...new Set(options.knownSecrets ?? [])]
    .filter((secret) => secret.length >= minLength)
    .sort((left, right) => right.length - left.length);
}

function uniqueFindings(findings: RedactionFinding[]): RedactionFinding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.type}:${finding.replacement}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
