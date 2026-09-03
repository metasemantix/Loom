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
- **Executed:** local D1 migration `0001_initial.sql` applied successfully with 11 commands.
- **Executed:** Wrangler started the local Worker successfully on port 8787 with the local D1 binding.
- **Executed:** the login page and My Space UI rendered successfully in a browser.
- **Executed:** Discord OAuth completed successfully when the local request and callback both used `localhost`; the earlier `127.0.0.1`/`localhost` mismatch exposed an OAuth state-cookie host mismatch.
- **Executed:** participant documents were created successfully through the browser UI.
- **Executed:** an anonymous browser read of participant context exposed the public test document and excluded the private test document.
- **Unverified:** production D1 creation/migration and Cloudflare deployment have not yet been demonstrated.

### Runtime-repair note

The first real execution pass exposed several test-toolchain assumptions that static inspection could not establish:

- the originally pinned `@cloudflare/workers-types` version did not exist in npm;
- the Cloudflare Vitest integration and its ambient test types needed updating for the current toolchain;
- the Worker compatibility date needed to be supported by the locally installed `workerd` binary;
- migration setup needed to account for D1 execution semantics.

These were infrastructure/test-harness issues rather than failures of the participant ownership model itself. After correction, all four existing integration tests pass.

### Caveats / things not to accidentally treat as established

- Passing the current tests establishes only the boundaries they actually exercise.
- The initial browser UI exposed creation/listing but not edit/history/delete; those were API-only until the follow-up below.
- Production deployment remains a separate verification gate.
- The current slice intentionally does not implement agent credentials, experiments, handshakes, or AI behavior; their absence is correct, not missing work.
- The implementation agent's first summary referenced commit `6803450`, while the GitHub PR used a different SHA. Treat GitHub repository state as authoritative over Codex-local commit identifiers.

---

## 2026-08-12 — My Space document-management follow-up

**Branch:** `codex/update-my-space-ui-and-local-oauth`

**GitHub commit:** `591a8eec81a927138af22377a66df42dd3fe122e` — `Expose document management in My Space`

**Codex-local commit reported in task summary:** `bdf5b07`

The GitHub branch is one commit ahead of `main`; the GitHub commit is the authoritative review target.

### Task

Expose existing document-management capabilities in My Space without changing backend semantics: show document kind, add edit/update, revision history, and confirmed deletion; keep visibility clear; and eliminate the local `127.0.0.1` versus `localhost` OAuth-state footgun by canonicalizing the local OAuth host rather than weakening state or cookie checks.

### Independently inspected

The actual GitHub diff was inspected.

- **Inspected:** only `src/index.ts`, `src/ui.ts`, and `test/worker.test.ts` change; there is no schema migration and no alternate document mutation API.
- **Inspected:** document cards now display `kind`, visibility, and current revision alongside title/content.
- **Inspected:** inline editing sends content and the existing content type to the existing owner-scoped `PUT /api/me/documents/{id}` route; it does not add metadata mutation.
- **Inspected:** revision history uses the existing owner-scoped `/api/me/documents/{id}/versions` route and displays revision number, timestamp, and content.
- **Inspected:** deletion uses the existing owner-scoped `DELETE /api/me/documents/{id}` route and requires a browser confirmation explicitly warning that all revision history will be erased.
- **Inspected:** local OAuth canonicalization is narrowly scoped to `localhost` and `127.0.0.1`. If the OAuth start host and configured callback host differ, Loom redirects the start request to the callback origin before creating OAuth state. Existing state hashing, state-cookie comparison, expiry, and one-time state consumption are unchanged.
- **Inspected:** the added tests check that the rendered My Space page exposes kind/visibility/edit/history/delete controls and that an OAuth start on `127.0.0.1` redirects to configured `localhost` without setting the state cookie on the wrong host.
- **Inspected:** the branch is exactly one commit ahead of current `main` and has no unrelated file changes.

### Validation status

Codex could not execute the test suite in its environment because dependency installation was blocked by an npm registry HTTP 403.

- **Reported:** `git diff --check` passed in the Codex environment.
- **Unverified:** `npm run typecheck` has not yet been run against this follow-up on the normal development machine.
- **Unverified:** `npm test` has not yet been run against this follow-up on the normal development machine.
- **Unverified:** edit, history, and confirmed delete have not yet been exercised manually in the browser against this follow-up.
- **Unverified:** the new OAuth canonicalization has not yet been manually exercised by starting sign-in from `127.0.0.1`.

### Test-quality note

The new "browser UI" test checks the generated HTML/script for the expected controls and request methods; it is useful regression coverage but is not a full DOM/browser interaction test. Manual browser verification remains worthwhile for the actual edit/history/delete behavior.

### Next verification gate

After merging or checking out this branch on the normal development machine:

1. run `npm run typecheck`;
2. run `npm test` and confirm the original authorization tests still pass alongside the two new tests;
3. open My Space and verify kind/visibility/revision display;
4. edit a document and confirm a new revision appears in history;
5. delete a disposable document and confirm the UI removes it after the destructive-history warning;
6. optionally start OAuth from `http://127.0.0.1:8787` and confirm Loom redirects to the canonical `localhost` start before contacting Discord;
7. update this entry from **Unverified** to **Executed** as evidence permits.

## 2026-09-03 — Agent compression revisions

Agent compression is now immutable, independently revisioned derived content. Selected revisions carry a same-document full-text source binding, prompt version, timestamp, and saving-actor provenance; authorized human and machine reads expose explicit missing/current/stale/unknown alignment. Legacy strings migrate without invented source, actor, or creation time. Participant and project-native document pages provide the shared canonical manual prompt, alignment status, and inspectable compression history.
