# Project Lifecycle Architecture

This document defines the lifecycle semantics of Loom projects. It is normative for project state transitions and the operations permitted in each state.

## Core invariant

Project membership, document ownership, and contribution presence are independent relationships.

A participant may own a document without being a project member, may remain a project member after retracting all of their documents, and may cease to be a member while deliberately leaving their documents contributed to the project corpus.

For concise discussion in this document:

- **POD** means a project-owned document;
- **OOD** means an owner-owned / participant-owned document contributed to a project.

These names are shorthand only; they do not change the settled ownership model.

## Lifecycle states

### Active

Normal collaboration. Subject to authorization, participants may join or leave, documents may be contributed or retracted, project-native artifacts may be created or changed, invitations may be issued, project metadata may change, and authorized agents may perform permitted mutations.

### Archived

The project still exists, including its corpus and project structure, but forward project activity is frozen.

Archive is reversible. Unarchive means **undo archive**: it restores the same project to active operation; it does not reconstruct a deleted project.

Archive disables project mutation, including:

- issuing or accepting invitations;
- pending invitations, which are revoked rather than suspended;
- new memberships or membership requests;
- new document contributions;
- project-native document creation or ordinary mutation;
- project metadata changes;
- role/administration changes other than the explicitly permitted unarchive operation;
- queued or future agent writes and other project mutations.

A mutation that began before archival must still pass a project-state check at commit time. Archiving therefore forms a server-authoritative mutation boundary rather than merely changing the UI.

Archive does **not** remove the corpus, snapshot participant-owned source content, or revoke the ordinary source owner's control. Existing members retain project visibility and read/export access according to the project's access policy. A participant may still retract their own contributed documents, and a member may still leave.

Owners and project administrators who held the relevant role before archival may unarchive an ordinary archived project. Loom does not attempt to adjudicate every governance dispute among an existing project team.

Project metadata is not edited while archived. Unarchive first, make the change, then archive again if desired.

### Scheduled for deletion

Deletion is not immediate. The project owner may explicitly schedule deletion. Scheduling requires the owner to type the project's **current title exactly** as confirmation.

The deletion deadline is fixed at **three days from scheduling**. Cancelling and later scheduling again creates a new three-day deadline; an old countdown is not paused or resumed.

If the project is active, scheduling deletion immediately places it under archived behavior. If it is already archived, it remains archived. The deletion schedule is additional lifecycle metadata on the archived project rather than a competing half-active lifecycle state.

During the grace period, allowed and forbidden actions are exactly those of an archived project, except for the deletion-specific rules below:

- only the owner may cancel scheduled deletion before the deadline;
- administrators cannot cancel deletion;
- administrators cannot unarchive or otherwise revive a project while deletion is scheduled;
- ownership transfer and role changes remain unavailable while deletion is scheduled;
- cancellation returns the project to ordinary **archived** state, never directly to active collaboration;
- once the deletion deadline is reached, cancellation is no longer permitted and finalization is irreversible.

Existing archived-project exceptions remain available during the grace period. In particular, members may leave, OOD owners may retract their own contributions, existing authorized readers may read/export according to archived-project rules, and any independently valid narrow creator-deletion entitlement for a POD remains governed by its own settled deadline and authorization rules rather than being broadened by project deletion.

Outstanding invitations are revoked when the project enters archived behavior and do not revive if deletion is cancelled.

Project members should eventually receive a Loom notification that deletion has been scheduled and be shown the planned deletion time. Notifications are not required to define the lifecycle semantics themselves.

### Shell

When the three-day deletion deadline is reached and deletion is finalized, the project becomes a terminal shell.

A shell is **not** an archived project. It contains no functioning project corpus and confers no permissions. It exists only to preserve minimal historical/provenance continuity.

The shell may retain:

- stable project ID;
- final project name/title and description or other essential project metadata;
- project creation, archival, deletion-scheduling, cancellation, and final-deletion timestamps/events as applicable;
- final manifest-style metadata and stable references sufficient to establish what the project contained;
- project changelog/lifecycle events;
- historical participant and role references, subject to identity/privacy retention policy;
- historical OOD contribution references and availability/tombstone metadata, without source document bodies;
- historical POD identity/provenance metadata sufficient to make former project-owned documents intelligible;
- shell-like POD revision history metadata such as revision identity/number, timestamp, actor provenance, and other non-content revision metadata where useful.

The shell must **not** retain:

- OOD bodies or private source copies;
- POD bodies;
- POD revision bodies, snapshots, patches, or diffs;
- live memberships, grants, capabilities, or collaboration permissions;
- live invitation tokens or other reusable invitation secrets;
- hidden content copied merely for convenience.

The final manifest is metadata/references, not a content archive.

A shell cannot be unarchived, reopened, or converted back to an active project. Stable project IDs are never reused.

## Document behavior at final project deletion

### Owner-owned / participant-owned documents (OODs)

Project deletion never deletes the participant-owned source artifact merely because it was contributed to the project.

At finalization, the project relationship ceases to provide access. The shell may retain permitted historical contribution references/tombstones, but it must not retain the source body. The source continues to be governed solely by its owner and the ordinary participant-document lifecycle.

### Project-owned documents (PODs)

PODs belong to the project and therefore end with the project.

At finalization:

- POD current bodies are destroyed;
- POD historical revision bodies/snapshots are destroyed;
- stored textual/binary diffs or patches are destroyed;
- the shell may retain only non-content document and revision provenance/history metadata as described above.

A POD does not become ownerless, transfer to its creator, or survive as a separately readable artifact after the project becomes a shell.

## State transitions

The principal transitions are:

- `active -> archived`
- `archived -> active` (unarchive / undo archive)
- `active -> archived + deletion scheduled`
- `archived -> archived + deletion scheduled`
- `archived + deletion scheduled -> archived` (owner cancellation before deadline)
- `archived + deletion scheduled -> shell` (deadline reached and finalized)

Deletion scheduling must not create an alternative path that bypasses archive protections.

## Project-deletion authorization

Initial project deletion policy is deliberately narrow:

- scheduling deletion is **owner-only**;
- the owner must confirm by typing the current project title exactly;
- cancellation before the deadline is **owner-only**;
- admins cannot countermand scheduled deletion or use archived-project succession to revive it;
- the deadline comparison must be server-authoritative at the commit/finalization boundary, not based only on an earlier UI or preflight decision.

An administrator's ability to unarchive applies only to an ordinary archived project with no active deletion schedule.

## Owner continuity and account deletion

A voluntary account deletion may be scheduled only after every active owned project has been deliberately handled. Each owned project must be transferred, archived, or already committed to project deletion according to lifecycle policy.

Both account deletion and project deletion use the same fixed three-day grace duration. Therefore, if the owner schedules project deletion first and subsequently schedules account deletion, the project's deletion deadline necessarily precedes the account deletion deadline.

Implementation must preserve that semantic ordering regardless of worker/cron execution order:

- a due project deletion must not become recoverable merely because account finalization runs first;
- scheduled project deletion remains an irreversible project lifecycle claim once its deadline is reached;
- finalization should process/resolve due owned project deletions before hard-deleting the owner, or otherwise enforce an equivalent invariant transactionally.

If an owner merely archives a project and later disappears or deletes their account without having scheduled project deletion, ordinary archived-project succession/recovery rules may apply to pre-existing administrators. That recovery path does **not** apply to a project with an explicit pending or already-due deletion schedule.

Loom does not infer abandonment from inactivity and does not automatically transfer ownership merely because an owner stops appearing.

An owner-only project is a valid and important configuration. Projects do not require multiple humans; a single participant may use a project as a structured workspace/database for their own authorized agents.

## Membership and project visibility

Project visibility is contingent on current project membership. Owning a document that remains contributed to a project does not itself grant project visibility after the owner leaves or is removed.

Conversely, the project document overview may identify a contribution as belonging to an outside/former contributor when that document remains deliberately present in the corpus.

A participant's own document overview should continue to mark contributions that remain linked to projects the participant no longer belongs to, so the owner can find and retract those contributions later.

## Leaving and removal

When a participant voluntarily leaves a project, Loom should offer a deliberate choice:

1. retract the participant's contributed documents; or
2. leave those documents in the project corpus.

The same ownership semantics apply when a participant is removed from a project. Removal must not depend on the removed participant cooperating. Their source ownership and continuing right to retract their own contributed documents remain intact.

Membership removal and contribution removal are therefore separate operations.

## Authorization architecture

Lifecycle state and authorization are separate concerns. Implementations should avoid scattering ad-hoc combinations of state booleans and role checks throughout endpoints.

Prefer one canonical project lifecycle state plus explicit lifecycle metadata such as a deletion deadline, together with centralized operation policy answering the question:

> May actor A perform operation X against project P in its current lifecycle state?

A loose `active_project` boolean should not become a second competing source of lifecycle truth.

## Disclosure limitation

Archival, retraction, and deletion prevent future Loom-mediated access where possible. They cannot make information disappear from a human or agent context that already received it while access was valid.

This limitation exists from the moment material is shared with a project until access is withdrawn and should be disclosed at consequential sharing boundaries.
