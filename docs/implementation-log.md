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

Initial Codex validation was blocked because its environment could not install npm dependencies. The slice was subsequently validated on a normal Windows development machine.

- **Executed:** `npm install` completed after correcting stale/invalid Cloudflare development dependency versions.
- **Executed:** `npm run typecheck` completes successfully with no TypeScript errors after bringing the Cloudflare/Vitest test typing setup in line with the installed toolchain.
- **Executed:** `npm test` completes successfully: **1 test file passed, 4 tests passed, 0 failed**.
- **Executed:** the integration tests confirm cross-participant document isolation for reads, edits, deletion, and revision-history access.
- **Executed:** the integration tests confirm immutable revision creation for edits and revision erasure on hard deletion.
- **Executed:** the integration tests confirm authenticated-session and same-origin requirements for mutations.
- **Executed:** the integration tests confirm that anonymous Markdown/JSON context projections expose public documents only while owner reads can include private documents.
- **Inspected/Corrected:** the original compatibility date exceeded the newest date supported by the installed local `workerd` test runtime; it was adjusted to a supported date so the Worker test runtime could start.
- **Inspected/Corrected:** test migration setup originally attempted to execute the complete multi-statement migration as a single D1 statement and failed with SQLite `incomplete input`; setup now executes the migration statements individually.
- **Unverified:** successful interactive local startup with Wrangler has not yet been demonstrated.
- **Unverified:** Discord OAuth has not yet been exercised against a real Discord application.
- **Unverified:** manual browser exercise of create/update/history/delete and the public/private projections has not yet been completed.
- **Unverified:** production D1 creation/migration and Cloudflare deployment have not yet been demonstrated.

### Runtime-repair note

The first real execution pass exposed several test-toolchain assumptions that static inspection could not establish:

- the originally pinned `@cloudflare/workers-types` version did not exist in npm;
- the Cloudflare Vitest integration and its ambient test types needed updating for the current toolchain;
- the Worker compatibility date needed to be supported by the locally installed `workerd` binary;
- migration setup needed to account for D1 execution semantics.

These were infrastructure/test-harness issues rather than failures of the participant ownership model itself. After correction, all four existing integration tests pass.

### Caveats / things not to accidentally treat as established

- Passing the current four tests establishes only the boundaries they actually exercise; it is not yet evidence that Discord OAuth or browser workflows work end-to-end.
- Local Worker startup, real OAuth, and production deployment remain separate verification gates.
- The current slice intentionally does not implement agent credentials, experiments, handshakes, or AI behavior; their absence is correct, not missing work.
- The implementation agent's summary referenced commit `6803450`, while the PR head visible through GitHub differed. Treat the merged repository state as authoritative rather than relying on the summary's commit identifier.

### Next verification gate

Before treating this slice as operational rather than locally test-verified:

1. pull the latest repository state;
2. apply the D1 migration locally;
3. start the Worker with Wrangler;
4. verify that the human-facing UI renders;
5. exercise document create/update/history/delete and public/private projections manually;
6. configure a real Discord OAuth application and complete a sign-in round-trip;
7. record any runtime fixes and the resulting verification status here;
8. only then create and migrate production D1 and deploy the Worker.
