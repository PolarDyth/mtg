/** Decode a room-code path segment defensively: %ZZ / truncated escapes throw
 * in decodeURIComponent, and a hand-edited URL should degrade to a rejected
 * join ("Can't sit down"), not a server-component 500. */
export function decodeRoomCode(raw: string): string {
  try {
    return decodeURIComponent(raw).trim().toUpperCase();
  } catch {
    return raw.trim().toUpperCase();
  }
}
