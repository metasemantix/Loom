# Account Lifecycle — Codex Implementation Brief

Implement Loom account deletion as a scheduled lifecycle, preserving the existing project/contribution ownership model.

Read `AGENTS.md` first, then `DECISIONS.md`, `LATER.md`, the project/contribution lifecycle docs, current auth/session/identity/document/project schema and migrations, and relevant tests. Inspect the implementation before changing it. Do not invent policy where this brief or the architecture already settles it.

## User-visible lifecycle

Account states must authoritatively distinguish at least `active`, `deletion_pending`, and finally deleted/tombstoned. Avoid competing booleans.

Deletion flow:

1. Participant opens account deletion.
2. Loom clearly explains what will be destroyed and what minimal provenance will remain.
3. Loom strongly offers a fresh export, but export is not mandatory.
4. Loom lists unresolved owned projects and refuses to schedule deletion until each is deliberately accounted for under existing lifecycle rules. Do not choose successors or mediate governance.
5. Participant confirms by typing their current display name.
6. Loom records an absolute server-side `deletion_due_at = now + 72 hours` (production/default; make duration configurable for tests).
7. Account immediately becomes frozen and the ordinary workspace is replaced/gated by a deletion-countdown screen.
8. Before the deadline the participant may export the frozen account or press **Cancel deletion**.
9. At the authoritative deadline, deletion becomes irreversible and an automated finalizer completes it. No second confirmation is required.

## Owned-project prerequisite

Before scheduling, inspect every project currently owned by the participant. Scheduling is blocked until each owned project has deliberately been transferred, archived, or placed on an existing project-deletion path if such a path exists.

Return/show an explicit human-readable list of unresolved projects. Loom must not auto-promote admins, infer abandonment, appoint successors, or otherwise mediate project governance.

## Frozen 72-hour grace period

Scheduling deletion is analogous to archiving the account: the deleting participant has no ordinary write access.

While `deletion_pending`, centrally reject ordinary authenticated mutations, including document create/upload/edit/delete/metadata changes, contribution/retraction/reauthorization, invitations, membership/role/ownership changes, project administration, profile writes, and other normal Loom mutations. Do not rely on UI hiding alone.

The countdown screen remains available and shows the deadline/countdown, frozen-state explanation, export, and **Cancel deletion**.

Cancellation is allowed only while authoritative server time is before `deletion_due_at`. Cancellation restores the same account and participant ID to `active`; nothing has been destroyed merely by scheduling deletion.

If the deadline has passed, cancellation fails even if physical cleanup has not yet finished.

OAuth/provider identity and session material may remain during grace only as required to authenticate into the frozen countdown/export/cancel flow.

## Effect on projects during grace

The participant's account freeze does not freeze projects for anyone else.

Until finalization, existing memberships and contributions remain in their existing states and other participants continue using projects normally. Scheduling deletion does not automatically retract anything.

If the deleting participant wants to reorganize or retract material, they must do so before scheduling deletion, or cancel deletion and return to active state.

## Final deletion

At/after the deadline, finalization is irreversible and idempotent/retry-safe.

Delete all Loom-stored participant-owned content and access/account material, including participant-owned document bodies, revision history, source-only/private document metadata, public availability of those documents, OAuth/provider identity mappings and provider IDs, sessions/credentials/auth state, ordinary editable profile/account state, and outstanding project invitations created by the participant.

Remove current project memberships/admin roles consistently with the already-resolved ownership prerequisite.

There is no restoration after finalization. If the same human later authenticates with the same external provider identity, they create a new Loom participant with a new stable participant ID and new provenance identifier. Never rebind the deleted participant identity. Display names may be reused.

## Contributions at final deletion

Final account deletion is a deliberate voluntary departure, not a kick. Do not use `suspended_after_removal` merely because the account disappeared.

Because participant-owned source documents are destroyed, project body access ends. Existing contribution relationships become the same unavailable/retracted-equivalent tombstones used by source deletion under the settled contribution lifecycle.

For each affected contribution:

- destroy source body and revisions;
- preserve stable document ID for continuity;
- preserve only frozen historical title and permitted provenance needed to explain that a contribution existed;
- remove live source path, visibility, evolving metadata and all body access;
- do not copy participant-owned content into the project;
- do not expose account deletion as a special project-facing reason if ordinary unavailable/retracted history is sufficient.

Project history should look like an ordinary participant departure plus unavailable contributions, not a public announcement of private account deletion.

## Participant provenance tombstone

Do not cascade away history that legitimately depends on the participant having existed.

Retain only the minimum participant tombstone needed for durable provenance:

- immutable stable participant/database ID;
- immutable human-readable provenance identifier;
- finalization/deletion timestamp;
- tombstone state sufficient to render **former user**;
- historical project/contribution references that legitimately need the stable participant identity.

Do not retain OAuth/provider IDs, credentials, sessions, contact/authentication data, document bodies/revisions, private source metadata, or an editable ghost profile.

Do not use the former mutable display name as the surviving current identity. Historical event snapshots already legitimately captured may remain, but current tombstone rendering should use the immutable provenance identifier plus **former user**.

Resolve existing provenance `ON DELETE RESTRICT` constraints deliberately through this tombstone design rather than deleting provenance or blocking account deletion forever.

## Immutable human-readable provenance identifier

Add an immutable, globally unique, human-friendly provenance identifier separate from both mutable display name and opaque DB ID, conceptually like `prime-copper-lark`.

Requirements:

- assigned once;
- immutable for the participant's lifetime and after deletion;
- globally unique and collision-safe;
- never recycled;
- safe to retain in provenance tombstones;
- not authentication;
- display names remain mutable/reusable decoration.

Use a database uniqueness constraint and a simple local generation strategy appropriate to the repository. Do not add an external service merely to generate names.

Loom does not need a public/browsable user directory in this slice. If a provenance lookup already exists, a known immutable provenance identifier may resolve to an active participant or minimal `former user` tombstone without exposing deleted data.

## Invitations and future notifications

At finalization, revoke outstanding project invitations created by the participant. They must not remain usable just because their project is active.

Do not build the general notification subsystem. Future intent is to inform project heads/admins when final account deletion affects their project; preserve structured events/state that can support this and record an explicit `LATER.md` item if needed.

## Automated finalizer and race safety

Use the appropriate existing Cloudflare/runtime scheduling primitive. Deletion must not depend on somebody revisiting Loom.

The stored deadline is authoritative. The finalizer must be idempotent and retry-safe. Concurrent cancellation/finalization must not resurrect a due account or leave a half-deleted account. Prefer transactional/state-transition boundaries so repeated execution cannot duplicate history/tombstones or leave credentials active after content deletion.

Infrastructure may physically process a deletion slightly after the nominal deadline, but once the deadline passes the account is no longer cancellable or active.

Use configurable short grace duration/fake time in tests; never wait 72 real hours.

## Confirmation UI

Before scheduling show, in one coherent flow:

- destructive-data summary;
- minimal retained-provenance summary;
- strong export option;
- unresolved owned-project list/actions if applicable;
- typed current-display-name confirmation;
- final **Schedule account deletion** action.

Do not create repeated scare-dialogs or puzzle confirmations. The informed confirmation plus 72-hour grace period is the safety mechanism.

## Export

Reuse the current participant export. Do not redesign its revision-heavy format in this slice. Ensure deletion-pending participants can export the frozen account state despite ordinary writes being disabled.

## Structured events

Use existing structured history/event conventions. Preserve enough non-content-leaking state for account deletion scheduled/cancelled, participant departure/finalization effects on projects, and contribution unavailability caused by source destruction.

Never put document bodies, OAuth IDs, credentials, or raw private metadata into history payloads.

## Required tests

Cover at minimum:

- unresolved owned active project blocks scheduling and is listed;
- deliberate transfer/archive resolves the prerequisite according to existing rules;
- no automatic successor is created;
- wrong typed display name rejects scheduling;
- correct confirmation schedules exact configurable grace duration;
- account freezes immediately;
- ordinary mutations are rejected server-side while pending;
- countdown/export/cancel remain available;
- other project members continue normal permitted project activity during grace;
- contributions remain unchanged until finalization;
- cancellation before deadline restores the same account/ID with data intact;
- cancellation at/after deadline is rejected;
- due account is finalized by automated finalizer path;
- repeated finalizer execution is harmless;
- documents/revisions/private source metadata are gone;
- public reads stop serving deleted content;
- OAuth/provider mappings and sessions/credentials are gone and cannot authenticate;
- invitations created by deleted participant are unusable;
- memberships/admin roles are removed;
- contribution tombstones preserve stable document identity/frozen permitted title/provenance without body/path/visibility leakage;
- participant tombstone preserves stable DB ID + immutable provenance identifier + former-user state, but no mutable profile/auth data;
- same external provider may later create a genuinely new account with new stable IDs;
- old stable IDs/provenance identifiers are never recycled/rebound;
- display-name reuse is allowed;
- cancellation/finalizer race cannot resurrect a due account;
- retry/partial invocation cannot leave an account half-active or duplicate destructive/history operations.

## Explicit non-goals

Do not expand this task into project deletion/shell implementation, project-owned documents, export-format redesign, general notifications, public user search/directory, agent runtime/access, semantic search/memory, automatic succession/governance, or recovery of fully deleted accounts.

## Completion

Update `CHANGELOG.md`, relevant architecture/decision docs if needed, and `LATER.md` for intentional deferrals. Preserve settled project/contribution semantics.

Run every check required by `AGENTS.md`, including migrations against fresh and populated prior schemas where applicable, typecheck/tests, diff checks, and available browser/runtime validation.

At completion report schema/migrations, account state machine, scheduling/finalizer mechanism, auth/session routing, provenance identifier/tombstone implementation, project/contribution effects, UI changes, tests, intentional deferrals, and any ambiguity encountered rather than guessed around.
