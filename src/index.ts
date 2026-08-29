import { hashSecret, opaque, principalFor, sessionCookie } from "./auth";
import { context, createDocument, deleteDocument, history, listDocuments, readDocument, updateDocument, updateMetadata, uploadDocument } from "./documents";
import { json, parseCookies, problem, requireSameOrigin } from "./http";
import type { Env } from "./types";
import { exportSpace } from "./export";
import { controlRoomPage, documentPage, invitationPage, loginPage, projectsPage, projectDocumentPage, spacePage } from "./ui";
import { getProfile, updateProfile } from "./profile";
import { changeRole, createInvitation, createProject, getProject, linkDocument, listOwnedContributions, listProjects, previewInvitation, reauthorizeContribution, removeMember, respondInvitation, revokeInvitation, setProjectLifecycle, recoverOwnerlessProject, transferOwnership, unlinkDocument, updateProject } from "./projects";
import { accountLifecycle, cancelDeletion, finalizeDueAccounts, provenanceIdentifier, scheduleDeletion } from "./accounts";
import { deletionPage } from "./ui";
import { createProjectDocument, deleteProjectDocument, listCreatorEntitlements, projectDocumentHistory, readProjectDocument, updateProjectDocument, updateProjectDocumentMetadata, uploadProjectDocument } from "./project-documents";
import { exportProject } from "./export";

function canonicalLocalOAuthStart(request: Request, redirectUri: string): Response | null {
  const requested = new URL(request.url), callback = new URL(redirectUri);
  const localHosts = new Set(["localhost", "127.0.0.1"]);
  if (localHosts.has(requested.hostname) && localHosts.has(callback.hostname) && requested.host !== callback.host) {
    return Response.redirect(`${callback.origin}/auth/discord`, 302);
  }
  return null;
}

async function discordStart(request: Request, env: Env): Promise<Response> {
  if (env.DISCORD_REDIRECT_URI) {
    const canonical = canonicalLocalOAuthStart(request, env.DISCORD_REDIRECT_URI);
    if (canonical) return canonical;
  }
  if (!env.DISCORD_CLIENT_ID || !env.DISCORD_REDIRECT_URI) return problem(503, "oauth_not_configured", "Discord sign-in is not configured");
  const state = opaque("oauth"), expires = new Date(Date.now() + 10 * 60_000).toISOString();
  await env.DB.prepare(`INSERT INTO oauth_states(state_hash,expires_at) VALUES(?,?)`).bind(await hashSecret(state), expires).run();
  const query = new URLSearchParams({ client_id: env.DISCORD_CLIENT_ID, response_type: "code", redirect_uri: env.DISCORD_REDIRECT_URI, scope: "identify", state, prompt: "consent" });
  const returnTo = new URL(request.url).searchParams.get("returnTo");
  const safeReturn = returnTo && /^\/invitations\/inv_[a-z0-9]+$/.test(returnTo) ? returnTo : "/me";
  const headers = new Headers({ location: `https://discord.com/oauth2/authorize?${query}` });
  headers.append("set-cookie", `loom_oauth_state=${state}; Path=/auth/discord/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
  headers.append("set-cookie", `loom_oauth_return=${encodeURIComponent(safeReturn)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
  return new Response(null, { status: 302, headers });
}

async function discordCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url), state = url.searchParams.get("state"), code = url.searchParams.get("code");
  if (!state || !code || parseCookies(request).loom_oauth_state !== state) return problem(400, "invalid_oauth_state", "Discord sign-in state is invalid or expired");
  const stateHash = await hashSecret(state);
  const stored = await env.DB.prepare(`SELECT state_hash FROM oauth_states WHERE state_hash=? AND expires_at>?`).bind(stateHash, new Date().toISOString()).first();
  if (!stored) return problem(400, "invalid_oauth_state", "Discord sign-in state is invalid or expired");
  await env.DB.prepare(`DELETE FROM oauth_states WHERE state_hash=?`).bind(stateHash).run();
  const tokenResponse = await fetch("https://discord.com/api/oauth2/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: env.DISCORD_CLIENT_ID, client_secret: env.DISCORD_CLIENT_SECRET, grant_type: "authorization_code", code, redirect_uri: env.DISCORD_REDIRECT_URI }) });
  if (!tokenResponse.ok) return problem(502, "oauth_exchange_failed", "Discord rejected the authorization code");
  const token = await tokenResponse.json<{ access_token: string }>();
  const identityResponse = await fetch("https://discord.com/api/users/@me", { headers: { authorization: `Bearer ${token.access_token}` } });
  if (!identityResponse.ok) return problem(502, "oauth_identity_failed", "Discord identity could not be loaded");
  const discord = await identityResponse.json<{ id: string; global_name?: string; username: string }>();
  let identity = await env.DB.prepare(`SELECT user_id FROM auth_identities WHERE provider='discord' AND provider_user_id=?`).bind(discord.id).first<{ user_id: string }>();
  const now = new Date().toISOString();
  if (!identity) {
    for (let attempt=0;attempt<8&&!identity;attempt++) {
      const userId=opaque("usr"),participantId=opaque("par"),provenance=provenanceIdentifier();
      try {
        await env.DB.batch([
          env.DB.prepare(`INSERT INTO users(id,display_name,created_at) VALUES(?,?,?)`).bind(userId, discord.global_name || discord.username, now),
          env.DB.prepare(`INSERT INTO auth_identities(id,user_id,provider,provider_user_id,created_at) VALUES(?,?,'discord',?,?)`).bind(opaque("idn"), userId, discord.id, now),
          env.DB.prepare(`INSERT INTO participants(id,user_id,public_slug,created_at,provenance_identifier) VALUES(?,?,?,?,?)`).bind(participantId, userId, participantId, now, provenance),
        ]);
        identity={user_id:userId};
      } catch(error) {
        if(!String(error).includes("provenance_identifier")||attempt===7)throw error;
      }
    }
    if(!identity)return problem(503,"identity_creation_failed","A unique Loom identity could not be created");
  }
  const secret = opaque("ses"), sessionId = opaque("sid"), expires = new Date(Date.now() + 30 * 86400_000).toISOString();
  await env.DB.prepare(`INSERT INTO sessions(id,user_id,secret_hash,expires_at,created_at) VALUES(?,?,?,?,?)`).bind(sessionId, identity.user_id, await hashSecret(secret), expires, now).run();
  const requestedReturn = decodeURIComponent(parseCookies(request).loom_oauth_return || "");
  const location = /^\/invitations\/inv_[a-z0-9]+$/.test(requestedReturn) ? requestedReturn : "/me";
  return new Response(null, { status: 302, headers: { location, "set-cookie": sessionCookie(secret) } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url), path = url.pathname;
    if (request.method === "GET" && path === "/") return Response.redirect(`${url.origin}/me`, 302);
    if (request.method === "GET" && path === "/login") return loginPage();
    if (request.method === "GET" && path === "/auth/discord") return discordStart(request, env);
    if (request.method === "GET" && path === "/auth/discord/callback") return discordCallback(request, env);
    const invitationPageMatch = path.match(/^\/invitations\/(inv_[a-z0-9]+)$/);
    if (invitationPageMatch && request.method === "GET") return invitationPage(invitationPageMatch[1]);
    const invitationApiMatch = path.match(/^\/api\/invitations\/(inv_[a-z0-9]+)$/);
    if (invitationApiMatch && request.method === "GET") return previewInvitation(env, invitationApiMatch[1]);
    const contextMatch = path.match(/^\/participants\/(par_[a-z0-9]+)\/context\.(json|md)$/);
    const principal = await principalFor(request, env);
    if (contextMatch && request.method === "GET") {
      if (principal?.accountState === "deletion_pending" && principal.deletionDueAt && principal.deletionDueAt <= new Date().toISOString()) return problem(410, "account_deletion_due", "The account deletion deadline has passed");
      if (principal?.accountState === "deletion_pending") return problem(423, "account_deletion_pending", "This account is frozen while deletion is pending");
      return context(request, env, contextMatch[1], contextMatch[2] as "json" | "md", principal);
    }
    if (!principal) return request.method === "GET" && path === "/me" ? Response.redirect(`${url.origin}/login`, 302) : problem(401, "authentication_required", "Sign in is required");
    if (["POST", "PUT", "DELETE"].includes(request.method) && !requireSameOrigin(request)) return problem(403, "invalid_origin", "A same-origin request is required");
    if (request.method === "GET" && path === "/api/me/account-lifecycle") return accountLifecycle(env, principal);
    if (request.method === "POST" && path === "/api/me/account-deletion/cancel") return cancelDeletion(env, principal);
    const deletionDue = principal.accountState === "deletion_pending" && !!principal.deletionDueAt && principal.deletionDueAt <= new Date().toISOString();
    if (deletionDue) {
      if (request.method === "GET" && ["/me", "/control-room", "/account-deletion"].includes(path)) return deletionPage();
      return problem(410, "account_deletion_due", "The account deletion deadline has passed");
    }
    if (request.method === "GET" && path === "/api/me/export") return exportSpace(env, principal);
    if (principal.accountState === "deletion_pending") {
      if (request.method === "GET" && ["/me", "/control-room", "/account-deletion"].includes(path)) return deletionPage();
      return problem(423, "account_deletion_pending", "This account is frozen while deletion is pending");
    }
    if (request.method === "GET" && path === "/account-deletion") return deletionPage();
    if (request.method === "POST" && path === "/api/me/account-deletion") return scheduleDeletion(request, env, principal);
    if (request.method === "GET" && path === "/me") return spacePage(principal.displayName, principal.participantId);
    if (request.method === "GET" && path === "/control-room") return controlRoomPage();
    if (request.method === "GET" && path === "/projects") return projectsPage();
    const humanDocumentMatch = path.match(/^\/documents\/(doc_[a-z0-9]+)$/);
    if (humanDocumentMatch && request.method === "GET") return documentPage(humanDocumentMatch[1], url.searchParams.get("project"));
    const projectDocumentPageMatch=path.match(/^\/project-documents\/(doc_[a-z0-9]+)$/);
    if(projectDocumentPageMatch&&request.method==="GET")return projectDocumentPage(projectDocumentPageMatch[1]);
    const declineMatch = path.match(/^\/api\/invitations\/(inv_[a-z0-9]+)\/decline$/);
    if (request.method === "GET" && path === "/api/me") return json({ user: { id: principal.userId, displayName: principal.displayName }, participant: { id: principal.participantId } });
    if (request.method === "GET" && path === "/api/me/profile") return getProfile(env, principal);
    if (request.method === "GET" && path === "/api/me/documents") return listDocuments(env, principal);
    const readMatch = path.match(/^\/api\/documents\/(doc_[a-z0-9]+)$/);
    if (readMatch && request.method === "GET") return readDocument(env, principal, readMatch[1], url.searchParams.get("project") ?? undefined);
    if (invitationApiMatch && request.method === "POST") return respondInvitation(env, principal, invitationApiMatch[1], "accept");
    if (declineMatch && request.method === "POST") return respondInvitation(env, principal, declineMatch[1], "decline");
    if (request.method === "PUT" && path === "/api/me/profile") return updateProfile(request, env, principal);
    if (request.method === "POST" && path === "/api/me/documents") return createDocument(request, env, principal);
    if (request.method === "POST" && path === "/api/me/documents/upload") return uploadDocument(request, env, principal);
    const documentMatch = path.match(/^\/api\/me\/documents\/(doc_[a-z0-9]+)$/);
    if (documentMatch && request.method === "PUT") return updateDocument(request, env, principal, documentMatch[1]);
    if (documentMatch && request.method === "DELETE") return deleteDocument(env, principal, documentMatch[1]);
    const historyMatch = path.match(/^\/api\/me\/documents\/(doc_[a-z0-9]+)\/versions$/);
    if (historyMatch && request.method === "GET") return history(env, principal, historyMatch[1]);
    const metadataMatch = path.match(/^\/api\/me\/documents\/(doc_[a-z0-9]+)\/metadata$/);
    if (metadataMatch && request.method === "PUT") return updateMetadata(request, env, principal, metadataMatch[1]);
    if (request.method === "GET" && path === "/api/projects") return listProjects(env, principal);
    if (request.method === "GET" && path === "/api/me/contributions") return listOwnedContributions(env, principal);
    if (request.method === "GET" && path === "/api/me/project-document-entitlements") return listCreatorEntitlements(env, principal);
    if (request.method === "POST" && path === "/api/projects") return createProject(request, env, principal);
    const projectMatch = path.match(/^\/api\/projects\/(prj_[a-z0-9]+)$/);
    if (projectMatch && request.method === "GET") return getProject(env, principal, projectMatch[1]);
    if (projectMatch && request.method === "PUT") return updateProject(request, env, principal, projectMatch[1]);
    const memberMatch = path.match(/^\/api\/projects\/(prj_[a-z0-9]+)\/members\/(par_[a-z0-9]+)$/);
    if (memberMatch && request.method === "DELETE") return removeMember(request, env, principal, memberMatch[1], memberMatch[2]);
    if (memberMatch && request.method === "PUT") return changeRole(request, env, principal, memberMatch[1], memberMatch[2]);
    const invitationsMatch = path.match(/^\/api\/projects\/(prj_[a-z0-9]+)\/invitations$/);
    if (invitationsMatch && request.method === "POST") return createInvitation(env, principal, invitationsMatch[1]);
    const revokeMatch = path.match(/^\/api\/projects\/(prj_[a-z0-9]+)\/invitations\/(pin_[a-z0-9]+)$/);
    if (revokeMatch && request.method === "DELETE") return revokeInvitation(env, principal, revokeMatch[1], revokeMatch[2]);
    const transferMatch = path.match(/^\/api\/projects\/(prj_[a-z0-9]+)\/ownership$/);
    if (transferMatch && request.method === "POST") return transferOwnership(request, env, principal, transferMatch[1]);
    const linksMatch = path.match(/^\/api\/projects\/(prj_[a-z0-9]+)\/documents$/);
    if (linksMatch && request.method === "POST") return linkDocument(request, env, principal, linksMatch[1]);
    const linkMatch = path.match(/^\/api\/projects\/(prj_[a-z0-9]+)\/documents\/(doc_[a-z0-9]+)$/);
    if (linkMatch && request.method === "DELETE") return unlinkDocument(env, principal, linkMatch[1], linkMatch[2]);
    const nativeCollectionMatch=path.match(/^\/api\/projects\/(prj_[a-z0-9]+)\/native-documents$/);
    if(nativeCollectionMatch&&request.method==="POST")return createProjectDocument(request,env,principal,nativeCollectionMatch[1]);
    const nativeUploadMatch=path.match(/^\/api\/projects\/(prj_[a-z0-9]+)\/native-documents\/upload$/);
    if(nativeUploadMatch&&request.method==="POST")return uploadProjectDocument(request,env,principal,nativeUploadMatch[1]);
    const copyMatch=path.match(/^\/api\/projects\/(prj_[a-z0-9]+)\/native-documents\/copy\/(doc_[a-z0-9]+)$/);
    if(copyMatch&&request.method==="POST")return createProjectDocument(request,env,principal,copyMatch[1],copyMatch[2]);
    const nativeMatch=path.match(/^\/api\/project-documents\/(doc_[a-z0-9]+)$/);
    if(nativeMatch&&request.method==="GET")return readProjectDocument(env,principal,nativeMatch[1]);
    if(nativeMatch&&request.method==="PUT")return updateProjectDocument(request,env,principal,nativeMatch[1]);
    if(nativeMatch&&request.method==="DELETE")return deleteProjectDocument(env,principal,nativeMatch[1]);
    const nativeMetadata=path.match(/^\/api\/project-documents\/(doc_[a-z0-9]+)\/metadata$/);
    if(nativeMetadata&&request.method==="PUT")return updateProjectDocumentMetadata(request,env,principal,nativeMetadata[1]);
    const nativeHistory=path.match(/^\/api\/project-documents\/(doc_[a-z0-9]+)\/versions$/);
    if(nativeHistory&&request.method==="GET")return projectDocumentHistory(env,principal,nativeHistory[1]);
    const projectExport=path.match(/^\/api\/projects\/(prj_[a-z0-9]+)\/export$/);
    if(projectExport&&request.method==="GET")return exportProject(env,principal,projectExport[1]);
    const reauthorizeMatch = path.match(/^\/api\/me\/contributions\/(prj_[a-z0-9]+)\/(doc_[a-z0-9]+)\/reauthorize$/);
    if (reauthorizeMatch && request.method === "POST") return reauthorizeContribution(env, principal, reauthorizeMatch[1], reauthorizeMatch[2]);
    const archiveMatch = path.match(/^\/api\/projects\/(prj_[a-z0-9]+)\/(archive|unarchive)$/);
    if (archiveMatch && request.method === "POST") return setProjectLifecycle(env, principal, archiveMatch[1], archiveMatch[2] === "archive" ? "archived" : "active");
    const recoveryMatch = path.match(/^\/api\/projects\/(prj_[a-z0-9]+)\/recover$/);
    if (recoveryMatch && request.method === "POST") return recoverOwnerlessProject(env, principal, recoveryMatch[1]);
    return problem(404, "not_found", "Route not found");
  },
  async scheduled(_controller:ScheduledController,env:Env):Promise<void>{await finalizeDueAccounts(env)},
} satisfies ExportedHandler<Env>;
