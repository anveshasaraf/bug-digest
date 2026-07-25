/**
 * Pure redaction helpers. The network RawEvent shape only ever stores
 * method/url/status/durationMs (no headers, no bodies — see src/lib/types.ts),
 * so the one place secrets can leak into a captured event is the URL itself
 * (query params, e.g. ?token=... or ?api_key=...). Redact those before the
 * event is ever posted out of the main world.
 */

const SENSITIVE_PARAM_NAMES = new Set([
  'token',
  'access_token',
  'accesstoken',
  'refresh_token',
  'refreshtoken',
  'id_token',
  'idtoken',
  'api_key',
  'apikey',
  'api-key',
  'key',
  'secret',
  'client_secret',
  'password',
  'passwd',
  'pwd',
  'session',
  'sessionid',
  'session_id',
  'auth',
  'authorization',
  'jwt',
  'sig',
  'signature',
]);

const REDACTED = '[redacted]';

/** JWT-shaped value: three dot-separated base64url segments. */
const JWT_PATTERN = /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/;

/** Long opaque-looking token, e.g. a hex/base64url API key, even under an innocuous param name. */
const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,}$/;

function looksLikeToken(value: string): boolean {
  return JWT_PATTERN.test(value) || OPAQUE_TOKEN_PATTERN.test(value);
}

/**
 * Redacts sensitive query-parameter values from a URL. Malformed URLs are
 * returned unchanged rather than throwing, since capture must never crash
 * the page it's observing.
 */
export function redactUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl, typeof location !== 'undefined' ? location.href : undefined);
  } catch {
    return rawUrl;
  }

  let changed = false;
  for (const [key, value] of url.searchParams.entries()) {
    if (SENSITIVE_PARAM_NAMES.has(key.toLowerCase()) || looksLikeToken(value)) {
      url.searchParams.set(key, REDACTED);
      changed = true;
    }
  }

  return changed ? url.toString() : rawUrl;
}
