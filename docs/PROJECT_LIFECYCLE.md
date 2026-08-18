# Project Lifecycle Architecture

This document defines the lifecycle semantics of Loom projects. It is normative for project state transitions and the operations permitted in each state.

## Core invariant

Project membership, document ownership, and contribution presence are independent relationships.

A participant may own a document without being a project member, may remain a project member after retracting all of their documents, and may cease to be a member while deliberately leaving their documents contributed to the project corpus.

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
- project-native document creation or mutation;
- project metadata changes;
- role/administration changes other than the explicitly permitted unarchive operation;
- queued or future agent writes and other project mutations.

A mutation that began before archival must still pass a project-state check at commit time. Archiving therefore forms a server-authoritative mutation boundary rather than merely changing the UI.

Archive does **not** remove the corpus, snapshot participant-owned source content, or revoke the ordinary source owner's control. Existing members retain project visibility and read/export access according to the project's access policy. A participant may still retract their own contributed documents, and a member may still leave.

Owners and project administrators who held the relevant role before archival may unarchive the project. Loom does not attempt to adjudicate every governance dispute among an existing project team.

Project metadata is not edited while archived. Unarchive first, make the change, then archive again if desired.

### Scheduled for deletion

Deletion is not an immediate destructive transition. An explicit project deletion request schedules deletion after a short grace period; the initial policy target is three days.

During the grace period the project is **archived** and follows the ordinary archive rules rather than introducing a separate half-active permission model. The deletion schedule is additional lifecycle metadata on the archived project.

Project members should be notified that deletion has been scheduled and shown when it is due to complete. Authorized cancellation during the grace period returns the project to the ordinary archived state; normal activity still requires an explicit unarchive.

If an owner schedules deletion and subsequently deletes their Loom account, the project remains safely archived and the scheduled lifecycle can continue. Account deletion is separately blocked until every owned project has already been transferred, archived, or committed to deletion.

### Shell

When scheduled deletion completes, the project becomes a terminal shell.

A shell is **not** an archived project. It contains no contributed document bodies and no functioning project corpus. It retains only the minimal historical residue needed to establish that the project existed and make provenance intelligible, such as:

- stable project ID;
- final project manifest;
- project changelog/lifecycle events;
- former project name and essential metadata;
- creation, archival, deletion-scheduling, and deletion timestamps as applicable;
- historical participant/role and contribution references to the extent required for provenance and subject to privacy/retention policy.

The final manifest contains references and metadata, not copied participant-owned contribution content.

A shell confers no permissions and cannot be unarchived. Stable project IDs are never reused.

## State transitions

The principal transitions are:

- `active -> archived`
- `archived -> active` (unarchive / undo archive)
- `archived -> archived + deletion scheduled`
- `archived + deletion scheduled -> archived` (cancel scheduled deletion)
- `archived + deletion scheduled -> shell` (grace period expires)

Deletion scheduling must not create an alternative path that bypasses archive protections.

## Owner continuity and account deletion

A voluntary account deletion may complete only after every project owned by that account has been deliberately handled. Each owned project must be transferred to a successor, archived, or scheduled/deleted according to lifecycle policy.

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