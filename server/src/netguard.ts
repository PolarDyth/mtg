// Network-edge policies for the ws layer: WebSocket Origin validation and
// client-IP resolution. Pure functions — no IO, no clock — so the security
// decisions are unit-testable apart from the socket plumbing in ws.ts.

/**
 * Cross-site WebSocket hijacking guard. A browser always sends Origin on a
 * cross-site ws upgrade, so: absent Origin (curl, Node clients, the e2e
 * harnesses) is allowed; present Origin must match the request's own Host or
 * an explicitly allowlisted origin (ALLOWED_ORIGINS, for split-origin
 * deployments).
 */
export function originAllowed(
  origin: string | undefined,
  host: string | undefined,
  extraOrigins: readonly string[]
): boolean {
  if (origin === undefined) return true;
  if (!host) return false;

  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false; // malformed, or "null" from sandboxed frames — deny
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;

  if (url.host.toLowerCase() === host.toLowerCase()) return true;
  return extraOrigins.includes(url.origin);
}

/**
 * Client IP behind N trusted proxy hops. With 0 hops (default) X-Forwarded-For
 * is ignored entirely — a direct client forging the header must not be able to
 * pick the IP that lands in the ban list. With n ≥ 1 trusted hops the safe
 * choice is the n-th entry from the RIGHT of the list: everything left of it
 * is client-supplied and spoofable.
 */
export function resolveClientIp(
  headers: Record<string, string | string[] | undefined>,
  remoteAddress: string | undefined,
  trustedHops: number
): string | undefined {
  if (trustedHops < 1) return remoteAddress;

  const forwarded = headers["x-forwarded-for"];
  const list = (
    typeof forwarded === "string" ? [forwarded] : forwarded ?? []
  )
    .flatMap((value) => value.split(","))
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  const index = list.length - trustedHops;
  if (index < 0) return remoteAddress;
  return list[index] ?? remoteAddress;
}

/**
 * Normalize the request URL into a form decodeURIComponent can always handle.
 * Next 16's production router throws deep inside routing on undecodable
 * escapes — a silent 500 for /game/%ZZ — instead of letting the page render
 * "bad room code". Two malformed classes are handled: a bare `%` (not
 * followed by two hex digits) is canonicalized to `%25`, which per RFC 3986
 * is exactly what a literal `%` in a path means; if valid escapes still form
 * broken UTF-8 (e.g. %E4%BD), every % is escaped so the URL decodes to its
 * literal text. Valid URLs pass through untouched.
 */
export function sanitizeRequestUrl(raw: string): string {
  if (!raw.includes("%")) return raw;
  let canonical = "";
  for (let i = 0; i < raw.length; ) {
    if (raw[i] === "%") {
      const hex = raw.slice(i + 1, i + 3);
      if (/^[0-9a-fA-F]{2}$/.test(hex)) {
        canonical += raw.slice(i, i + 3);
        i += 3;
      } else {
        canonical += "%25";
        i += 1;
      }
    } else {
      canonical += raw[i];
      i += 1;
    }
  }
  try {
    decodeURIComponent(canonical);
    return canonical;
  } catch {
    return canonical.replace(/%/g, "%25");
  }
}
