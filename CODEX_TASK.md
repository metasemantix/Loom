# Current Codex Task

Implement the next Loom project-lifecycle slice: **archive/unarchive enforcement plus leave/removal contribution semantics**.

Read `AGENTS.md` first, then `DECISIONS.md`, `docs/PROJECT_LIFECYCLE.md`, `docs/CONTRIBUTION_LIFECYCLE.md`, relevant migrations, `src/projects.ts`, `src/index.ts`, `src/ui.ts`, and existing project/invitation tests. Treat the architecture docs as normative. If implementation and architecture appear to conflict, preserve the architecture and report the conflict rather than silently choosing an easier behavior.

## Scope

Implement:

- canonical project lifecycle state: `active | archived`;
- archive/unarchive endpoints and UI;
- owner **and admin** may archive/unarchive; ordinary members may not;
- centralized server-side lifecycle guards for project mutations;
- archive revokes all outstanding invitations immediately;
- invitation acceptance must re-check current project state and must never create membership after archive;
- archived projects remain readable/exportable according to existing policy, while forward collaboration/mutation is frozen;
- source owners may still retract their own participant-owned contributions while archived;
- project status is exposed by list/detail APIs and visibly represented in UI;
- voluntary leave with a simple unchecked-by-default checkbox: `Withdraw my contributions from this project`;
- kicked-member contribution suspension rather than automatic deletion or continued body access;
- contribution relationship state sufficient to represent `active`, `suspended_after_removal`, and `retracted`;
- source-owner control over contribution relationships even after project membership ends;
- project-side metadata/tombstones for unavailable contributions without document-body leakage;
- `agents_only` hides bodies from humans but does not hide ordinary metadata such as title, contributor/provenance, contribution state, and history;
- structured lifecycle/contribution events and tests for the above.

Do **not** implement scheduled deletion, shell creation, account deletion, ownerless succession, project-native import/export, a new notification subsystem, or agent runtime in this slice.

## Core invariants

Project membership, document ownership, and contribution presence are independent relationships.

Participant-owned documents remain participant-owned. Archive must never snapshot or secretly preserve participant-owned content. Lifecycle restrictions must be enforced server-side, not merely by hiding controls.

Do not use a competing `active_project` boolean if lifecycle state already expresses the same fact. Existing projects and existing project-document relationships should migrate safely to `active`.

Avoid deleting relationship rows merely to represent state transitions. Preserve stable document identity and provenance.

## Archive semantics

Archive is reversible. Unarchive means **undo archive** and restores the same project.

On archive:

1. transition to archived;
2. record actor/timestamp and structured project event;
3. revoke all outstanding invitations;
4. reject forward project mutations.

At minimum audit and guard project metadata/read-policy edits, new contribution links, invitation creation/acceptance, membership additions, role changes, ownership transfer, and any existing project-native mutation routes.

While archived, still allow normal project read access, existing export behavior, voluntary leave, source-owner retraction, and authorized unarchive.

Revoked invitations do not revive on unarchive.

Lifecycle checks must be authoritative near commit time so an operation started while active cannot commit after archive.

## Voluntary leave

UI should be simple:

```text
Leave project
[ ] Withdraw my contributions from this project
```

No wizard. Checkbox is unchecked by default. Showing the number of affected contributions is useful if easy.

Unchecked:

- membership ends;
- current contributions remain active;
- former member loses project visibility;
- source owner still sees/manages/retracts their own contribution relationships from their own document side.

Checked:

- membership ends;
- their current participant-owned contributions transition to `retracted`;
- source documents remain intact.

The owner cannot simply leave while still owner; preserve the ownership-transfer requirement.

## Kick/removal

Removal ends membership immediately and does not require cooperation from the removed participant.

Do not keep their document bodies readable by default, and do not delete the contribution relationship.

Instead, active contributions transition to `suspended_after_removal`:

- document body becomes unavailable through the project;
- title/allowed metadata/provenance/history remain represented;
- source ownership is unchanged;
- former contributor can later retract or explicitly re-authorize the same relationship.

Past consent while participating is not treated as indefinite consent after expulsion.

A polished re-authorization UI may be deferred if necessary, but the schema/backend must not make re-authorization impossible. Record a clear `LATER.md` item if that UI is deferred.

## Owner-side contribution control

Project membership must not be required for a source owner to inspect or manage their own contribution relationship.

After leaving/removal, owner-side API/UI should expose enough to identify the project/document relationship, its state (`active`, `suspended_after_removal`, `retracted`), and available owner actions.

Owning a contributed document does not grant project visibility.

## Project document overview and `agents_only`

Project members may see former/outside contributor entries when those relationships remain legitimately represented.

Clearly distinguish active outside contributions, suspended contributions, and retracted/unavailable contributions. Suspended/retracted entries expose only permitted metadata, never body content.

For `agents_only` projects, human members may still see title, contributor/provenance, contribution state, metadata/history, and document existence. Human body access remains forbidden.

## History/events

Use structured event types where appropriate, including equivalents of:

- `project_archived`
- `project_unarchived`
- `member_left`
- `member_removed`
- `contribution_retracted`
- `contribution_suspended`
- `contribution_reauthorized`

Document title changes are metadata history separate from document-body visibility. Historical titles may remain in provenance/tombstones; do not copy bodies into history.

Persistent notifications are desired later, especially for former contributors, but do not expand this slice into building a notification subsystem if one does not already exist. Preserve structured events/state that can support it and add an explicit `LATER.md` item where needed.

## Tests

Add positive and negative coverage for:

- owner/admin can archive; member cannot;
- owner/admin can unarchive; member cannot;
- status returned by APIs/UI;
- archive revokes outstanding invitations;
- a pre-existing invitation cannot be accepted after archive and creates no membership;
- blocked archived mutations fail server-side;
- archived read/leave/source-owner retraction still work;
- voluntary leave unchecked keeps contributions active;
- voluntary leave checked retracts them without deleting source docs;
- kicked member loses membership and their active contribution relationships become suspended, not deleted;
- suspended bodies are unavailable through the project while metadata remains;
- former contributor still has owner-side control;
- `agents_only` exposes permitted metadata to humans but not body content;
- existing active-project behavior remains intact unless deliberately changed by this task.

Audit all project-related routes rather than guarding only obvious handlers.

## Completion

Follow all validation and smoke-test requirements in `AGENTS.md`. Update `CHANGELOG.md`; use `LATER.md` for intentional deferrals.

At completion, report schema/migrations, lifecycle helpers, endpoints changed, UI changes, tests, deferred items, and any ambiguity encountered rather than guessed around.
