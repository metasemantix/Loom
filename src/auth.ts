import type { Env, Principal } from "./types";
import { parseCookies } from "./http";

const encoder = new TextEncoder();

export function opaque(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return `${prefix}_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function hashSecret(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function principalFor(request: Request, env: Env): Promise<Principal | null> {
  const secret = parseCookies(request).loom_session;
  if (!secret) return null;
  const row = await env.DB.prepare(`
    SELECT u.id user_id, u.display_name, p.id participant_id,p.account_state,p.deletion_due_at
    FROM sessions s JOIN users u ON u.id=s.user_id JOIN participants p ON p.user_id=u.id
    WHERE s.secret_hash=? AND s.expires_at > ? AND p.withdrawn_at IS NULL AND p.account_state!='deleted'
  `).bind(await hashSecret(secret), new Date().toISOString()).first<Record<string, string>>();
  return row ? { userId: row.user_id, participantId: row.participant_id, displayName: row.display_name, accountState: row.account_state as Principal["accountState"], deletionDueAt: row.deletion_due_at } : null;
}

export function sessionCookie(secret: string, maxAge = 60 * 60 * 24 * 30): string {
  return `loom_session=${encodeURIComponent(secret)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
