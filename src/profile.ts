import { json, problem, readJson } from "./http";
import type { Env, Principal } from "./types";

export function lookupId(participantId: string): string {
  return participantId.startsWith("par_") ? participantId.slice(4, 12) : participantId.slice(0, 8);
}

export async function getProfile(env: Env, principal: Principal): Promise<Response> {
  const identities = await env.DB.prepare(`SELECT provider,provider_user_id FROM auth_identities WHERE user_id=? ORDER BY provider`).bind(principal.userId).all();
  const participant = await env.DB.prepare(`SELECT provenance_identifier FROM participants WHERE id=?`).bind(principal.participantId).first<{provenance_identifier:string}>();
  return json({ participant: { id: principal.participantId, displayName: principal.displayName, lookupId: lookupId(principal.participantId), provenanceIdentifier: participant?.provenance_identifier }, identities: identities.results });
}

export async function updateProfile(request: Request, env: Env, principal: Principal): Promise<Response> {
  let body; try { body = await readJson(request); } catch (error) { return problem(400, "invalid_request", (error as Error).message); }
  if (typeof body.displayName !== "string" || !body.displayName.trim() || body.displayName.length > 80) return problem(400, "invalid_request", "displayName must be between 1 and 80 characters");
  await env.DB.prepare(`UPDATE users SET display_name=? WHERE id=?`).bind(body.displayName.trim(), principal.userId).run();
  return json({ participant: { id: principal.participantId, displayName: body.displayName.trim(), lookupId: lookupId(principal.participantId) } });
}
