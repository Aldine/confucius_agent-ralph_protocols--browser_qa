export type Allowlist = {
  origins: Set<string>;
};

function normalizeOrigin(origin: string): string | null {
  try {
    const u = new URL(origin);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

function isLoopbackHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function throwWith(code: string, message: string, details?: Record<string, unknown>): never {
  const err: any = new Error(message);
  err.code = code;
  err.details = details ?? {};
  throw err;
}

export function loadAllowlistFromEnv(): Allowlist {
  const raw = process.env.CONFUCIUS_ALLOW_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173";
  const origins = new Set<string>();
  
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const normalized = normalizeOrigin(trimmed);
    if (normalized) origins.add(normalized);
  }
  
  return { origins };
}

export type ApprovalPolicy =
  | { require: false }
  | { require: true; token: string };

export function loadApprovalPolicyFromEnv(): ApprovalPolicy {
  const require = process.env.CONFUCIUS_REQUIRE_APPROVAL !== "false";
  const token = process.env.CONFUCIUS_APPROVAL_TOKEN ?? "confucius-default-token";
  return require ? { require: true, token } : { require: false };
}

export function validateUrl(url: string): URL {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      throwWith("INVALID_ARGUMENT", "Only http and https URLs are allowed", { url });
    }
    return u;
  } catch (err: any) {
    if (err.code === "INVALID_ARGUMENT") throw err;
    throwWith("INVALID_ARGUMENT", "Invalid URL format", { url, error: err.message });
  }
}

export function assertUrlAllowed(url: string, allowlist: Allowlist) {
  const u = validateUrl(url);
  const origin = `${u.protocol}//${u.host}`;
  
  // Loopback is always allowed
  if (isLoopbackHost(u.hostname)) return;
  
  if (!allowlist.origins.has(origin)) {
    throwWith("NOT_ALLOWED", "Origin not in allowlist", { 
      origin, 
      allowed: Array.from(allowlist.origins) 
    });
  }
}

export function isNonLocalhost(u: URL) {
  return !isLoopbackHost(u.hostname);
}

export function requireApprovalIfNeeded(u: URL, policy: ApprovalPolicy) {
  if (!policy.require) return false;
  return isNonLocalhost(u);
}

export function verifyApprovalTokenOrThrow(token: string | undefined, policy: ApprovalPolicy, u: URL) {
  if (!policy.require) return;
  
  if (!requireApprovalIfNeeded(u, policy)) return;
  
  if (!token || token !== policy.token) {
    throwWith("APPROVAL_REQUIRED", "Approval token required for non-localhost navigation", {
      url: u.toString(),
      hint: "Set approval_token parameter or CONFUCIUS_APPROVAL_TOKEN environment variable"
    });
  }
}
