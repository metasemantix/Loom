# Loom Implementation Log

This file records implementation handoffs and their verification status.

It is not a substitute for commit history or pull request discussion. Its purpose is to preserve a compact, durable account of what an implementation agent was asked to do, what it reported, what was independently inspected, and what remains unverified or unresolved.

Use the following status labels:

- **Reported** — stated by the implementation agent or PR description.
- **Inspected** — confirmed by reading the repository diff or files.
- **Executed** — confirmed by actually running the relevant command or test.
- **Unverified** — present as a claim or test definition, but not successfully executed.
- **Open** — requires follow-up or a decision.

---

## 2026-08-12 — Initial participant-document vertical slice

**PR:** #3 — `codex/implement-initial-vertical-slice-features`

**Task given to Codex:**

> Implement steps 1–4 of the vertical slice in `LATER.md`, using the architecture and constraints in `docs/infrastructure-mvp.md`. Establish the Cloudflare Worker/D1 project, Discord sign-in, participant-owned text documents with revision history, and stable authorized Markdown/JSON reads. Do not implement agent credentials, experiments, handshakes, or any AI functionality yet. Add tests for ownership and authorization boundaries.

### Reported implementation

Codex reported that it:

- established a Cloudflare Worker/D1 project with deployment configuration, environment templates, migration support, and development/deployment instructions;
- added a normalized D1 schema for Loom users, extensible authentication identities, hashed browser sessions, participants, participant-owned documents, and revision provenance;
- implemented Discord OAuth with expiring single-use state validation, stable Discord-to-Loom identity mapping, opaque Loom identifiers, and secure session cookies;
- added a minimal sign-in and `My Space` UI for participant documents;
- implemented server-resolved ownership checks for document creation, editing, deletion, and revision-history access;
- made updates create immutable document revisions while hard deletion removes associated revision history;
- added stable `/participants/{participant_id}/context.md` and `.json` projections with public-only reads for anonymous/non-owner callers and private reads for the owner;
- enforced authenticated sessions and same-origin mutation requests at the Worker routing boundary;
- added Worker/D1 integration tests for cross-participant boundaries, revision behavior, deletion, authentication/origin enforcement, and public/private projections;
- deliberately excluded agent credentials, experiments, handshakes, and backend AI.

### Independently inspected

The PR diff was inspected after creation.

Confirmed in the diff:

- **Inspected:** Worker/D1 scaffold exists, including `package.json`, `wrangler.jsonc`, TypeScript config, Vitest config, migrations, source modules, and tests.
- **Inspected:** `.dev.vars.example` contains Discord client ID and secret placeholders.
- **Inspected:** the initial D1 migration defines users, authentication identities, hashed sessions, OAuth state records, participants, documents, and document versions.
- **Inspected:** document ownership is resolved from the authenticated principal rather than from a participant identifier supplied by a client mutation.
- **Inspected:** document updates create new `document_versions` rows and move `current_version_id`.
- **Inspected:** document deletion is intentionally hard deletion and relies on cascading deletion of version rows.
- **Inspected:** participant context projections distinguish owner access from public access and mark owner responses `private, no-store`.
- **Inspected:** the README documents local development and deployment steps and explicitly states the features deferred from this slice.
- **Inspected:** the PR contains test files intended to cover the claimed authorization and ownership boundaries.

### Validation status

- **Executed:** `git diff --check` was reported successful by Codex.
- **Executed:** Codex reported a clean working tree after its commit.
- **Unverified:** dependencies could not be installed in the Codex environment because the npm registry returned HTTP 403.
- **Unverified:** the TypeScript typecheck could not complete because Cloudflare/dev dependencies were unavailable.
- **Unverified:** the Vitest integration suite was not executed for the same dependency-installation reason.
- **Unverified:** successful local startup, Discord OAuth round-trip, D1 migration execution, and deployment have not yet been demonstrated in a working environment.

### Caveats / things not to accidentally treat as established

- The presence of integration tests is not equivalent to those tests passing. They remain unexecuted until dependencies can be installed.
- The implementation has been inspected structurally, but runtime compatibility with the selected Cloudflare/Wrangler package versions is not yet proven.
- OAuth behavior has not yet been exercised against a real Discord application.
- The current slice intentionally does not implement agent credentials, experiments, handshakes, or AI behavior; their absence is correct, not missing work.
- The implementation agent's summary referenced commit `6803450`, while the current PR head visible through GitHub is different. Treat the PR itself as the authoritative review target rather than relying on the summary's commit identifier.

### Next verification gate

Before treating this slice as operational rather than structurally implemented:

1. install dependencies in a normal development environment;
2. run `npm run typecheck`;
3. run `npm test`;
4. apply the D1 migration locally;
5. start the Worker;
6. exercise sign-in, create/update/history/delete, public/private projections, and a cross-participant denial path;
7. only then merge or record any runtime fixes discovered during that pass.
