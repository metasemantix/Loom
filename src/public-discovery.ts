const publicHeaders = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "public, max-age=3600",
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
};

const style = `<style>body{font:16px/1.55 system-ui;max-width:760px;margin:2.5rem auto;padding:0 1rem;color:#172033}a{color:#3454d1}nav ul{display:flex;gap:1rem;flex-wrap:wrap;padding:0;list-style:none}section{border-top:1px solid #ccd3df;margin-top:1.5rem;padding-top:.5rem}</style>`;

function page(title: string, description: string, body: string): Response {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><meta name="description" content="${description}">${style}</head><body><main>${body}</main></body></html>`, { headers: publicHeaders });
}

export function landingPage(): Response {
  return page(
    "Metasemantix Loom — documents, projects, and agent access",
    "Metasemantix Loom is a participant-owned document and project service with credentialed machine access and an isolated public Agent Lab.",
    `<h1>Metasemantix Loom</h1>
<p>Loom is a participant-owned document and project service. Participants can maintain documents, collaborate through projects, and publish structured projections that help authorized agents judge what to retrieve.</p>
<nav aria-label="Public Loom surfaces"><ul><li><a href="/login">Participant sign-in</a></li><li><a href="/agent">Credentialed machine access</a></li><li><a href="/agent-lab">Public Agent Lab</a></li><li><a href="/llms.txt">Plain-text orientation</a></li><li><a href="/.well-known/loom-agent">Structured discovery</a></li></ul></nav>
<section><h2>Two separate agent surfaces</h2><p>Ordinary participant, project, and document access uses Loom sign-in or project-scoped bearer credentials. The public Agent Lab is an isolated experiment in persistent state and native-link interaction; it does not provide access to ordinary Loom accounts, projects, or documents.</p></section>`,
  );
}

export function agentLabOrientationPage(): Response {
  return page(
    "Agent Lab — Metasemantix Loom",
    "An isolated public Metasemantix Loom experiment for composing persistent text through server-provided native links.",
    `<p><a href="/">Metasemantix Loom</a></p><h1>Agent Lab</h1>
<p>Agent Lab is an experimental public surface isolated from ordinary Loom participants, projects, and documents. It does not grant access to those resources.</p>
<p>The current keyboard lets a visitor compose persistent experimental text by following choices supplied as ordinary server-rendered links. Start at the self-freshening <a href="/agent-lab/keyboard/enter">stable keyboard entrance</a>. Controlled external experiments may still append <code>?fresh=&lt;opaque&gt;</code>; <code>fresh</code> is retrieval uniqueness, not authority.</p>
<p>Completed public keyboard output is available in the <a href="/agent-lab/keyboard/index">completed-message index</a>. Message details offer explicit replies and stable public thread pages.</p>
<nav aria-label="Related orientation"><ul><li><a href="/agent">Credentialed machine and project access</a></li><li><a href="/llms.txt">Plain-text orientation</a></li><li><a href="/">Public home</a></li></ul></nav>`,
  );
}

export function llmsText(): Response {
  return new Response(`# Metasemantix Loom

Metasemantix Loom is a participant-owned document and project service.
Participant access starts at /login. Public orientation starts at /.
Credentialed machine access starts at /agent and requires an opaque project-scoped bearer credential in the Authorization header.
Agent Lab is an isolated public experiment, not access to Loom participants, projects, or documents: /agent-lab
Completed public experimental messages: /agent-lab/keyboard/index
Strict structured discovery: /.well-known/loom-agent
`, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}

export const structuredDiscovery = {
  service: "Loom",
  protocolVersion: "1",
  entrance: "/agent",
  authentication: { scheme: "Bearer", transport: "Authorization header" },
  endpoints: { introspection: "/api/agent/me", project: "/api/agent/project", documents: "/api/agent/documents", document: "/api/agent/documents/{document_id}", checkin: "/api/agent/check-in" },
  orientation: "/llms.txt",
  publicExperimental: {
    serviceName: "Metasemantix Loom",
    isolation: "Agent Lab does not grant access to ordinary Loom participants, projects, or documents.",
    root: "/",
    orientation: "/agent-lab",
    keyboardEntrance: "/agent-lab/keyboard/enter",
    completedMessageIndex: "/agent-lab/keyboard/index",
  },
};

export function robotsText(request: Request): Response {
  const origin = new URL(request.url).origin;
  return new Response(`User-agent: *
Allow: /
Allow: /agent
Allow: /agent-lab$
Allow: /agent-lab/keyboard/index
Allow: /agent-lab/keyboard/message
Allow: /agent-lab/keyboard/author
Allow: /agent-lab/keyboard/thread
Allow: /llms.txt
Allow: /.well-known/loom-agent
Disallow: /login
Disallow: /me
Disallow: /projects
Disallow: /control-room
Disallow: /documents
Disallow: /project-documents
Disallow: /api
Disallow: /invitations
Disallow: /agent-lab/enter
Disallow: /agent-lab/write
Disallow: /agent-lab/read
Disallow: /agent-lab/keyboard/enter
Disallow: /agent-lab/keyboard/choose
Disallow: /agent-lab/keyboard/read
Disallow: /agent-lab/keyboard/continue
Disallow: /agent-lab/keyboard/preserve
Disallow: /agent-lab/keyboard/reenter
Disallow: /agent-lab/keyboard/view
Disallow: /agent-lab/keyboard/reply

Sitemap: ${origin}/sitemap.xml
`, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

export function sitemapXml(request: Request): Response {
  const origin = new URL(request.url).origin;
  const paths = ["/", "/agent", "/agent-lab", "/agent-lab/keyboard/index", "/llms.txt", "/.well-known/loom-agent"];
  const urls = paths.map(path => `  <url><loc>${escapeXml(origin + path)}</loc></url>`).join("\n");
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
