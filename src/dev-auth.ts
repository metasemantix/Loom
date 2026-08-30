import { hashSecret, opaque, principalFor, sessionCookie } from "./auth";
import type { Env } from "./types";

export const DEV_USER_ID = "usr_localdevelopment";
export const DEV_PARTICIPANT_ID = "par_localdevelopment";
const DEV_IDENTITY_ID = "idn_localdevelopment";
const DEV_PROVIDER_ID = "local-development";

/** The opt-in is deliberately insufficient on its own: deployed hostnames fail closed. */
export function devAuthEnabled(request: Request, env: Env): boolean {
  const hostname = new URL(request.url).hostname;
  return env.DEV_AUTH_BYPASS === "1" && (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]");
}

export async function establishDevSession(request: Request, env: Env): Promise<Response | null> {
  if (!devAuthEnabled(request, env) || request.method !== "GET" || await principalFor(request, env)) return null;
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO users(id,display_name,created_at) VALUES(?,?,?)").bind(DEV_USER_ID, "Local Developer", now),
    env.DB.prepare("INSERT OR IGNORE INTO auth_identities(id,user_id,provider,provider_user_id,created_at) VALUES(?,?,?,?,?)").bind(DEV_IDENTITY_ID, DEV_USER_ID, "development", DEV_PROVIDER_ID, now),
    env.DB.prepare("INSERT OR IGNORE INTO participants(id,user_id,public_slug,created_at,provenance_identifier) VALUES(?,?,?,?,?)").bind(DEV_PARTICIPANT_ID, DEV_USER_ID, DEV_PARTICIPANT_ID, now, DEV_PROVIDER_ID),
  ]);
  const participant = await env.DB.prepare("SELECT id FROM participants WHERE id=? AND user_id=? AND account_state='active' AND withdrawn_at IS NULL").bind(DEV_PARTICIPANT_ID, DEV_USER_ID).first();
  if (!participant) return new Response("Local development identity is unavailable", { status: 503 });
  const secret = opaque("ses"), expires = new Date(Date.now() + 30 * 86400_000).toISOString();
  await env.DB.prepare("INSERT INTO sessions(id,user_id,secret_hash,expires_at,created_at) VALUES(?,?,?,?,?)").bind(opaque("sid"), DEV_USER_ID, await hashSecret(secret), expires, now).run();
  const url = new URL(request.url);
  return new Response(null, { status: 302, headers: { location: url.pathname + url.search, "set-cookie": sessionCookie(secret) } });
}

export async function markDevAuth(response: Response): Promise<Response> {
  if (!response.headers.get("content-type")?.startsWith("text/html")) return response;
  const html = (await response.text()).replace("<main>", '<main><strong class="dev-auth" role="status">DEV AUTH</strong>');
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(html, { status: response.status, statusText: response.statusText, headers });
}
