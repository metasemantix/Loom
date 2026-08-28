# Current Codex Task

Implement the next bounded Loom slice: **project-native documents**.

Read `AGENTS.md` first, then `DECISIONS.md`, `docs/PROJECT_NATIVE_DOCUMENTS.md`, `docs/PROJECT_LIFECYCLE.md`, `docs/CONTRIBUTION_LIFECYCLE.md`, relevant migrations, document/project/account code, UI, export code, and existing tests. Treat `docs/PROJECT_NATIVE_DOCUMENTS.md` as normative for this slice.

If existing implementation and settled architecture conflict, preserve the architecture and report the conflict rather than silently choosing an easier behavior.

## Goal

Add documents that are genuinely owned by a project while preserving Loom's existing participant-owned document and contribution semantics.

A project-native document is project property from creation. Participant authorship/provenance remains recorded, but the creator is not the document owner.

Do not implement project deletion in this slice.

## Required semantics

Implement the complete semantics in `docs/PROJECT_NATIVE_DOCUMENTS.md`, including:

- explicit, unambiguous project ownership for native documents;
- stable document identity and independent revision history;
- creator and revision-actor provenance separate from ownership;
- owner/admin/member creation and ordinary editing while the project is active;
- project audience/access semantics rather than a second personal Public/Private visibility model;
- a fixed **72-hour creator deletion entitlement** stored as a concrete deadline;
- no deadline reset from edits by creator or others;
- immediate document deletion when authorized, with no second deletion grace period;
- owner/admin normal deletion authority;
- no permanent deletion authority for ordinary members merely because they created or edited a document;
- creator deletion entitlement surviving voluntary leave and administrative removal until the original deadline;
- no restoration of ordinary project access merely to exercise that exceptional deletion right;
- archive blocking ordinary native-document mutations while preserving a still-valid creator deletion entitlement;
- creator account deletion leaving project-owned documents intact and using existing deleted-participant provenance semantics;
- explicit distinction between participant-owned contribution/linking and creation of an independent project-owned copy;
- project-owned copies receiving a new stable ID, independent history, and source provenance without future synchronization;
- project export including accessible native documents;
- personal account export not absorbing project-owned bodies merely because the participant authored them;
- project activity/history integration using existing provenance machinery.

## Creator deletion authorization

This is a security/lifecycle invariant, not merely a UI convenience.

For the exceptional 72-hour creator delete path, authorization must depend on creator identity, document identity, the stored deadline, and applicable account/lifecycle state. It must **not** require current project membership.

A creator who leaves or is kicked during the window must still be able to delete the project-native document until the original deadline. Project leadership must not be able to defeat the temporary creator right by removing the creator.

The former member must not regain project read/edit access in order to exercise deletion. Provide a narrow owner-side/former-member-accessible control surface for documents whose creator entitlement is still live.

At the exact deadline the entitlement is over. Test `before` versus `at/after` explicitly.

## Archive interaction

Existing archive semantics remain authoritative: archived projects are read-only collaboration spaces.

Project-native documents remain readable according to existing project access/audience rules. Ordinary create/edit/rename/move/delete operations must not bypass archive merely because an actor is owner/admin.

The still-valid 72-hour creator deletion entitlement is an explicit lifecycle exception and remains exercisable while archived.

## Copy versus contribution

Do not repurpose participant-owned contribution rows to represent native ownership.

The UI/API must preserve the conceptual distinction:

- **Contribute/link:** participant owns source; existing contribution lifecycle applies.
- **Copy to project:** create a new project-owned document with a new ID and independent history.

A project-owned copy records appropriate source provenance. Later source edit, privacy change, retraction, or deletion does not change the copy, and project-copy edits do not propagate to the source.

Copying crosses an ownership boundary. Provide clear confirmation that the new copy belongs to the project and is independent of the source.

## Account lifecycle interaction

The merged account-deletion lifecycle is authoritative.

Project-native documents must survive creator account deletion because the project, not the participant, owns them. When the creator reaches the hard account-deletion deadline, their personal creator entitlement can no longer be exercised. Existing participant tombstone/provenance behavior should make historical authorship intelligible without retaining the old mutable display name.

Do not weaken account-deletion deadline enforcement to implement this feature.

## Data model and migration

Choose the smallest clear schema extension that represents project ownership without making participant ownership ambiguous.

Preserve existing participant-owned documents, IDs, revisions, visibility, and contribution relationships. Existing installations must migrate without data loss or accidental ownership conversion.

Use D1-compatible migration patterns already established in the repository. Do not disable foreign-key enforcement as a migration shortcut.

Store the creator deletion deadline concretely so future policy changes do not retroactively change existing entitlements.

## Authorization and race safety

Permission/lifecycle checks must be authoritative at mutation/commit time, not merely preflight checks or hidden UI controls.

Audit race windows involving:

- project archive during create/edit/copy/delete;
- membership removal/leave during creator delete;
- role change during ordinary mutation/delete;
- creator entitlement expiry during delete;
- creator account reaching its hard deletion deadline during delete.

A request that began while authorized must not commit after the relevant authority disappears.

Reuse centralized guards/helpers where possible rather than scattering subtly different ownership checks across routes.

## UI

Add the smallest coherent UI needed to exercise the feature:

- create a document directly in an eligible active project;
- open/read/edit project-native documents according to project policy;
- distinguish native documents from participant-owned contributions where necessary for comprehension/actions;
- expose normal deletion only to authorized roles;
- expose the creator's temporary deletion action while valid, including after membership ends, without exposing the project corpus;
- provide an intentional Copy to project flow distinct from contribution/linking;
- hide/disable controls whose operations are forbidden by archive or other lifecycle state.

Do not add a second project-native visibility system unless required by already-settled architecture.

## Tests

Implement the required coverage in `docs/PROJECT_NATIVE_DOCUMENTS.md` and regression-test existing document/contribution behavior.

At minimum cover:

- active owner/admin/member create/edit permissions;
- project ownership distinct from creator provenance;
- owner/admin deletion;
- ordinary member denial after creator entitlement expires;
- creator deletion before 72 hours;
- denial exactly at/after deadline unless separately authorized;
- edits do not alter the deadline;
- creator deletion after voluntary leave;
- creator deletion after kick;
- no former-member corpus access from the exceptional delete surface;
- archive blocks ordinary mutations but permits a live creator entitlement;
- creator account deletion leaves native documents intact and ends personal authority at the account deadline;
- deleted-creator provenance;
- project-owned copy has new ID/independent history/source provenance;
- source changes/deletion/retraction do not affect project copy;
- participant-owned contribution semantics remain unchanged;
- project export versus personal account export behavior;
- migration safety for existing participant-owned documents.

Include negative tests and exact-boundary/race-sensitive tests, not only happy paths.

## Non-goals

Do not implement in this slice:

- project scheduled deletion or shell finalization;
- a general ownership-transfer primitive;
- automatic ownership succession;
- a new notification subsystem;
- per-document project ACL complexity not already required by settled policy;
- synchronization between participant source documents and project-owned copies;
- agent runtime/capability work unrelated to making the document model correct.

If one of these becomes necessary to avoid corrupt semantics, stop and report the architectural dependency rather than silently expanding scope.

## Completion

Follow all validation and functional smoke-test requirements in `AGENTS.md`.

Run:

```text
npm test
npm run typecheck
git diff --check
```

Perform meaningful UI smoke tests where the environment permits them, including creation, edit, deletion, copy-to-project, and existing participant-document loading. Verify rendered inline browser JavaScript actually parses.

Update `CHANGELOG.md`; use `LATER.md` only for genuine intentional deferrals.

At completion, report separately:

- schema/migration changes;
- ownership/authorization helpers;
- endpoints and UI surfaces changed;
- provenance/export behavior;
- tests/checks passed;
- tests/checks failed;
- checks that could not be performed;
- intentional deferrals;
- ambiguities encountered rather than guessed around.
