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
