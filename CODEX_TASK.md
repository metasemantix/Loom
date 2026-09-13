# Current Codex Task

Implement Slice A from `docs/PUBLIC_AGENT_DISCOVERY.md`: give Loom a coherent public, crawlable front door and standard discovery primitives without changing ordinary authorization or Agent Lab capability semantics.

Read and follow `AGENTS.md`, `docs/TESTING_MODEL.md`, `docs/PUBLIC_AGENT_DISCOVERY.md`, `docs/AGENT_ACCESS.md`, `docs/AGENT_GET_CAPABILITY_EXPERIMENT.md`, `docs/AGENT_LAB_RELATION_CHAINS.md`, `docs/TELEMETRY_AND_ANALYTICS.md`, `README.md`, and the current implementation/tests. Treat the repository as the source of truth.

## Goal

An unfamiliar unauthenticated visitor or agent that reaches Loom should be able to discover what Loom is, distinguish ordinary credentialed machine access from the isolated public Agent Lab experiment, and navigate the stable public surfaces using ordinary HTML links. Search engines should receive standard crawl/index hints for those stable public surfaces.

This slice changes discovery and orientation only. It must not broaden authority, expose secrets, alter project/document access, or change the keyboard capability protocol.

## Current relevant behavior

Verify against `main` before editing.

- `/` currently redirects unconditionally to `/me`.
- `/llms.txt` already exists and gives a very short orientation to `/agent` and `/.well-known/loom-agent`.
- `/.well-known/loom-agent` already exposes structured discovery for bearer-token machine access.
- `/agent` already exists as a session-only bearer-token workbench for ordinary project-scoped machine credentials.
- `/agent-lab` has no stable orientation page.
- Explicit `/agent-lab/...` routes are dispatched anonymously before ordinary principal resolution.
- Agent Lab Slice 1 and the keyboard are deliberately isolated from ordinary Loom auth/projects/documents.
- The current keyboard includes fresh entrance, native-link composition, read junction, immediate continuation, explicit preserve/re-entry author continuity, and public read-only index/message/author pages.
- Earlier Agent Lab documentation intentionally forbids discovery because those experiments were controlled transport tests. `docs/PUBLIC_AGENT_DISCOVERY.md` now defines the next-phase discovery posture without changing the interpretation of those earlier runs.
- There is currently no intentional `robots.txt` or `sitemap.xml` discovery layer.

## Exact implementation scope

### 1. Public root landing page

Replace the unconditional `GET / -> /me` redirect with a simple server-rendered public landing page.

It must:

- work without JavaScript;
- have a meaningful HTML title and concise description/meta description;
- identify the service as **Metasemantix Loom** in visible text so the deployment is distinguishable from unrelated projects named Loom;
- describe only implemented capabilities in ordinary language;
- contain native `<a href>` links to `/login`, `/agent`, `/agent-lab`, `/llms.txt`, and `/.well-known/loom-agent`;
- make clear that ordinary participant/project/document access and Agent Lab are different surfaces;
- preserve existing signed-in flows: `/me`, `/projects`, `/control-room`, etc. remain unchanged.

Do not turn the landing page into a marketing framework or add client-side dependencies.

### 2. Add stable `/agent-lab` orientation

Add unauthenticated `GET /agent-lab` as a stable orientation page.

It must explain, compactly and truthfully:

- Agent Lab is an experimental public surface isolated from ordinary Loom participants/projects/documents;
- the current keyboard lets a visitor compose persistent experimental text by following server-provided native links;
- the stable keyboard entrance is `/agent-lab/keyboard/enter`;
- controlled external experiments may use `?fresh=<opaque>` to make the initial retrieval address unique, but `fresh` is not authority;
- completed public keyboard output is visible at `/agent-lab/keyboard/index`;
- ordinary credentialed machine/project access starts at `/agent` instead.

Provide native links to the stable keyboard entrance, public completed-message index, `/agent`, `/llms.txt`, and the public root.

Do not expose or manufacture any raw action/re-entry capability on this orientation page.

### 3. Extend `/llms.txt`

Keep `/llms.txt` concise, plain text, and non-secret.

Update it to:

- identify **Metasemantix Loom**;
- explain the distinction between participant-owned document/project service, credentialed machine access, and isolated public Agent Lab experiments;
- point to `/`, `/agent`, `/agent-lab`, `/.well-known/loom-agent`, and `/agent-lab/keyboard/index`;
- state that project/document machine access requires an opaque bearer credential;
- avoid embedding capability-bearing URLs or private resource identifiers.

### 4. Extend strict structured discovery

Extend `GET /.well-known/loom-agent` additively.

Preserve the meaning and compatibility of the existing authenticated machine-access fields. Add a clearly separated public/experimental discovery section describing stable Agent Lab orientation/entrance/index routes and the public root.

Do not advertise ephemeral choose/read/continue/preserve/reenter capability URLs. Do not imply Agent Lab grants project/document access.

### 5. Add `robots.txt`

Add unauthenticated `GET /robots.txt` as `text/plain`.

The policy should allow crawling of the stable public discovery/orientation surfaces while preventing intentional indexing of private/authenticated/application and capability-bearing action surfaces.

At minimum reason explicitly about:

- `/`;
- `/agent`;
- `/agent-lab`;
- `/agent-lab/keyboard/index` and stable read-only detail/author views;
- `/llms.txt`;
- `/.well-known/loom-agent`;
- `/login`;
- `/me`, `/projects`, `/control-room`, `/documents`, `/project-documents`, `/api`, `/invitations`;
- Agent Lab mutation/capability routes such as keyboard `choose`, `read`, `continue`, `preserve`, `reenter`, and Slice 1 `write`/`read`.

Do not put raw capability values in this file.

Include a `Sitemap:` line using the current request origin so local/test and production responses remain correct.

### 6. Add `sitemap.xml`

Add unauthenticated `GET /sitemap.xml` as valid XML.

List only stable public URLs suitable for indexing. At minimum include:

- `/`;
- `/agent`;
- `/agent-lab`;
- `/agent-lab/keyboard/index`;
- `/llms.txt`;
- `/.well-known/loom-agent`.

Do not include:

- capability-bearing Agent Lab URLs;
- `/agent-lab/keyboard/enter?fresh=...` variants;
- private/authenticated participant/project/document routes;
- invitations;
- API mutation endpoints;
- individual message/author detail URLs if doing so would require enumerating database state merely to generate the sitemap.

Use the request origin and XML-escape generated URLs correctly.

### 7. Reconcile the old Agent Lab discovery prohibition

Update `docs/AGENT_GET_CAPABILITY_EXPERIMENT.md` narrowly so it no longer contradicts `docs/PUBLIC_AGENT_DISCOVERY.md`.

Preserve the historical fact that the original transport experiments intentionally hid Agent Lab and supplied the entrance explicitly. Add a dated/current-phase clarification that public discovery is now a separate subsequent experiment and that the earlier results must not be reinterpreted as discovery tests.

Do not rewrite the historical experiment narrative as if discovery had always been enabled.

### 8. Tests

Add/adjust focused automated coverage proving at minimum:

- anonymous `GET /` returns 200 HTML rather than redirecting to `/me`;
- root page identifies Metasemantix Loom and exposes the required native links;
- `/me` still follows the existing unauthenticated sign-in behavior and authenticated behavior is not broadened;
- anonymous `GET /agent-lab` returns 200 orientation HTML with stable links but no raw capability material;
- `/llms.txt` names the stable public and credentialed surfaces without capability-bearing URLs;
- `/.well-known/loom-agent` preserves existing machine-access fields and adds the separated public/experimental discovery information;
- `/robots.txt` has the intended allow/disallow behavior and a correct origin-relative sitemap declaration;
- `/sitemap.xml` is valid enough for deterministic test parsing/assertion, uses the request origin, contains the intended stable public URLs, and excludes private/capability-bearing routes;
- existing Agent Lab capability/keyboard tests continue to pass unchanged in semantics;
- existing ordinary auth/project/document acceptance tests remain intact.

When testing generated HTML/XML, inspect the rendered response rather than merely source-template fragments, consistent with `AGENTS.md`.

## Required checks

Run:

- `npm test`
- `npm run typecheck`
- `git diff --check`

Also perform the smallest available functional smoke test for `/`, `/agent-lab`, `/robots.txt`, `/sitemap.xml`, `/llms.txt`, and `/.well-known/loom-agent`.

If the execution environment cannot install dependencies or run the Worker, report that precisely and still perform every check available locally. GitHub Actions remains the independent CI layer.

## Documentation changes

- Keep `docs/PUBLIC_AGENT_DISCOVERY.md` authoritative for the public discovery roadmap.
- Make the narrow historical/current-phase reconciliation in `docs/AGENT_GET_CAPABILITY_EXPERIMENT.md` described above.
- Update `README.md` only as needed so its product-surface description matches the new public root and Agent Lab orientation. Do not duplicate the full discovery architecture there.

## Explicit non-goals

Do not add:

- Search Console API integration or automatic search-engine submission;
- SEO keyword stuffing, backlink generation, or third-party posting;
- telemetry/schema changes;
- A2A, MCP, Agent Cards, or another standardized agent protocol;
- `/agent.json` or another overlapping manifest unless implementation reveals a concrete requirement and it is reported rather than silently added;
- autonomous agent account creation;
- anonymous ordinary project/document access;
- broader bearer-token permissions or document writes;
- changes to Agent Lab capability generation, hashing, expiry, replay, author continuity, message-chain semantics, or GET-mutation mechanics;
- dynamic sitemap enumeration of participant/project/private data;
- JavaScript requirements for public discovery navigation.
