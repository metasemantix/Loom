# Road to a Respectable MVP

## Deferred lifecycle polish

- Add a polished owner-side contribution re-authorization flow and persistent notifications for former contributors. The lifecycle schema and structured events preserve the state needed for both. In the current UI, `suspended_after_removal` is visible and can be retracted, but the existing backend re-authorization path is not yet surfaced; add a clear owner-side **Restore contribution** action that does not restore project membership or project visibility.
- Add a human-readable project activity/history view over the structured lifecycle and contribution events already being recorded. Preserve stable document IDs and provenance continuity; do not expose unavailable document bodies through the log.
- Improve project-card expansion UX: replace the current one-way **Open project** expansion with an explicit show/hide (or equivalent) toggle so an expanded project can be collapsed and the action does not continue to say “Open project” while already open.
- Rename the document contribution action currently labelled **Review link**. It refers to granting a document to the project rather than reviewing a URL; prefer direct contribution wording such as **Add to project**, while retaining the explicit grant confirmation before the mutation.
- Tidy the voluntary-leave confirmation layout. The current checkbox appears only after **Leave project** is clicked, which is semantically fine, but it should render as a coherent confirmation panel containing the question, unchecked **Withdraw my contributions from this project** option, Leave action, and Cancel action.
- Consider document-level lifecycle event granularity when one membership action affects several contributions. Current aggregate suspension/retraction events preserve operational state, but a detailed project changelog may benefit from one stable-document event per affected contribution.
- Historical contribution rows currently retain participant provenance through `ON DELETE RESTRICT` foreign keys. Account-deletion and participant-identity tombstone semantics must resolve that deliberately rather than deleting provenance or permanently blocking account deletion.

Loom has moved beyond the original infrastructure vertical slice. Sign-in, participant-owned documents, revision and metadata history, upload, export, mutable visibility, Loom-native identity, logical paths, and the first project/link-corpus model already exist.

This document therefore describes the **visible road from the current implementation to a respectable MVP**: something coherent enough to use for a small real collaboration without exposing internal IDs as normal UX, losing project continuity, or requiring the future agent architecture to be solved first.

It is intentionally near-horizon. Longer-term architecture belongs in `VISION.md` and `DECISIONS.md`; ideas that do not need to be on the MVP path should not accumulate here merely because they are interesting.

## MVP target

A respectable MVP should let a participant:

- sign in and maintain a portable personal corpus;
- create, upload, organize, edit, inspect history for, export, and delete their artifacts;
- distinguish private and public material;
- create or join a project through an explicit consensual flow;
- deliberately link participant-owned material into a project without surrendering ownership;
- deliberately create or copy material into a project-owned corpus when collective ownership is intended;
- understand who administers a project and what happens if its creator disappears;
- leave voluntarily while explicitly choosing whether their participant-owned contributions remain available or are retracted;
- remove a participant while immediately suspending project access to that participant's contributed document bodies without deleting source ownership or provenance;
- preserve source-owner control over contributions after membership ends, including later retraction or explicit re-authorization where applicable;
- archive or delete a project with intelligible lifecycle semantics;
- use human-readable pickers and invitations rather than copying internal database IDs;
- expose stable, permission-aware discovery surfaces suitable for later agent retrieval;
- rely on basic security and provenance boundaries before agents routinely ingest shared material.

Backend AI, autonomous coordination, semantic memory, matching, direct messaging, and a rich agent-control system are **not prerequisites** for this milestone.

## 1. Make projects human-usable

The current project model proves the relational semantics but still exposes implementation details as UX.

### Document picker

Replace normal manual document-ID entry with a picker/search over the participant's eligible documents.

The final project-contribution action remains explicit and should state that the project's read audience receives access while ownership and write control remain with the participant. Prefer direct wording such as **Add to project** rather than the current **Review link** label.

Raw document-ID entry may remain as an advanced/debugging path.

### Consensual invitations

Replace direct owner-side member insertion with invitation and acceptance.

Minimum useful flow:

1. an authorized project administrator creates an invitation;
2. Loom produces a revocable tokenized URL;
3. the recipient opens a project preview;
4. if necessary, they authenticate and return to the same invitation;
5. they explicitly choose **Join** or decline;
6. only acceptance creates project membership.

Opening an invitation URL must never itself create membership.

For the MVP, single-use invitations with a sensible default expiry are sufficient. The project should expose outstanding invitations and allow them to be revoked. Reusable/public invitation links can wait until a real use case requires them.

The preview should show enough context for an informed decision without exposing the protected corpus: project name and description, inviter/owner, read policy, and basic membership context.

Archiving a project revokes outstanding invitations immediately; they do not revive on unarchive.

### Membership controls

Provide explicit **Leave project** and authorized **Remove member** actions.

Project membership, document ownership, and contribution presence are independent relationships.

Voluntary leave offers a simple unchecked **Withdraw my contributions from this project** option. If left unchecked, membership ends while existing active contributions remain available to the project; the former member loses project visibility but retains source ownership and owner-side control over those contribution relationships. If checked, those contributions are retracted while the participant-owned source artifacts remain intact.

Removal/kicking is deliberately different. Membership ends immediately and the removed participant's active contribution relationships become `suspended_after_removal`: project access to the document bodies stops, stable document identity and permitted historical metadata/provenance remain, and source ownership is unchanged. The former contributor may later retract the relationship or explicitly re-authorize the same stable contribution without regaining project membership or project visibility.

## 2. Give projects a real lifecycle

### Project description

Projects need a small human-readable description independent of their document corpus so invitations and project lists are intelligible.

### Owner and creator-chosen administrators

Projects have an owner and may have owner-chosen administrators.

The owner chooses whom to trust; Loom should not infer or automatically promote a successor. Administrators provide continuity and receive only explicitly defined administrative capabilities.

Support deliberate ownership transfer. The current owner should not be able to leave an active project without first transferring ownership or resolving the project's lifecycle.

Project deletion should initially remain owner-only unless a later governance model deliberately changes that rule.

### Archive

Archive is a reversible collaboration freeze, not deletion. Owner and admins may archive and unarchive. Archiving cuts off invitations and forward project mutation while preserving ordinary authorized read/export access, voluntary leave, source-owner retraction, and the ability of authorized owner/admin roles to undo archive.

Do not maintain a competing lifecycle boolean when one canonical project state can express the same fact.

### Scheduled deletion and shell

Project deletion is explicit and should not immediately destroy the project. Schedule deletion with a short grace period (initial policy target: three days). During that grace period the project follows ordinary **archived** rules rather than gaining a separate half-active permission model. Cancellation returns it to ordinary archived state; resuming collaboration still requires explicit unarchive.

When deletion completes, retain only a minimal historical shell sufficient to establish that the project and its contributions existed. The shell contains no contributed document bodies and confers no permissions. It may retain the stable project ID, final project manifest, project changelog/lifecycle events, former name and essential metadata, lifecycle timestamps, and historical participant/role/contribution references to the extent permitted by the eventual identity/privacy policy.

The final manifest contains references/metadata, not copied participant-owned contribution content. Stable project IDs are never reused. A shell cannot be unarchived.

Archival, retraction, and deletion can prevent future Loom-mediated access; they cannot erase information already received by a human or agent while access was valid. This limitation should be disclosed at consequential sharing boundaries.

## 3. Add project-owned artifacts

The current project corpus consists of references to participant-owned material. The MVP should additionally support genuinely project-native artifacts.

### Ownership destination at creation/upload

Creation and upload should offer an explicit destination such as:

```text
Create in:
- My Space
- Project Gloom
- Project Loom
```

Only projects in which the participant has permission to create project-owned artifacts should appear.

Choosing a project creates a project-owned artifact from birth. Choosing My Space creates a participant-owned artifact. Folder/path movement does not change ownership.

### Project-owned document behavior

Project-owned artifacts:

- have stable document identities and revision histories;
- belong to the project, not to the participant who created the first revision;
- survive departure or disappearance of an individual owner/admin while the project remains active;
- follow explicit project write/edit policy rather than participant ownership rules;
- participate in project export and discovery surfaces.

Keep the initial write policy simple. A small owner/admin/member distinction is preferable to a general ACL system.

### Copy to project

Allow a participant-owned artifact to be deliberately copied into a project corpus.

Copying must:

- create a new project-owned artifact with a new identity;
- leave the original unchanged;
- preserve provenance pointing to the source artifact;
- start an independent revision history;
- clearly warn that the project copy is outside the original owner's sole control and will not disappear if the original is later changed or deleted.

Do not add a separate ownership-transfer primitive for the MVP. Copying plus an independent decision about the original covers the immediate need with clearer semantics.

## 4. Basic preflight and content-security boundary

Before project-owned copies make irreversible sharing easy, add a modest preflight layer.

### Deterministic checks first

Check for obvious accidental or dangerous material where practical, including:

- common secret/API-key patterns;
- credentials;
- executable/script or dangerous markup where inappropriate;
- malformed or suspicious encoded payloads;
- other inexpensive high-confidence checks.

Findings should be specific and reviewable. Do not silently rewrite source content.

### Optional AI-assisted review

An AI-assisted preflight may flag semantic oversharing that deterministic rules cannot identify well: unexpectedly sensitive passages, material apparently unrelated to the destination project, or suspicious instruction/prompt-injection content.

For ordinary participant-controlled sharing, this should be advisory by default: show what was flagged and allow the participant to review and deliberately continue. Platform-level unsafe content may be governed separately.

The MVP must not depend on AI being available for ordinary storage, linking, or project operation.

## 5. Discovery surfaces / manifold manifests

Once projects and ownership destinations are stable, implement manifests as projections over the existing corpus rather than as a second storage system.

At minimum, Loom needs cheap structured discovery for:

- the participant/owner view;
- public material;
- each project/collaboration corpus.

A document may appear in several discovery surfaces without being duplicated. Manifest visibility must be caller-aware: metadata about inaccessible artifacts must not leak merely because the artifact belongs to a manifest.

Keep the first representation deterministic and inspectable: stable IDs, titles, kinds, paths where permitted, ownership/provenance, contribution state, compact descriptions where available, and retrieval references. Retrieval of the manifest must not load every full document body.

AI-assisted manifest upkeep may later propose descriptions, tags, classifications, or membership, but the manifest structure itself must work without AI and remain editable/portable.

## 6. Agent-ready retrieval boundary

The respectable MVP does not need autonomous agents, but it should stop just short of requiring architectural surgery when they arrive.

Define a stable read-oriented protocol through which an authorized caller can:

- identify itself;
- retrieve the discovery surface it is permitted to see;
- fetch permitted artifacts by stable reference;
- distinguish participant-owned from project-owned material;
- observe provenance, contribution state, and relevant revision metadata;
- receive no hidden/private metadata outside its grants.

Do not implement arbitrary agent write access merely to complete this section. Bounded write capabilities, explicit agent credentials, activity logs, and richer authorization can follow once the retrieval model has been exercised by a real client.

Retrieved corpus content remains untrusted data, not trusted agent instruction.

## 7. MVP hardening

Before calling the milestone respectable, exercise it as an existing installation rather than only as a fresh test database.

Required hardening includes:

- migration testing against populated prior schema versions;
- functional browser smoke tests for the main human paths;
- syntax validation for generated/inline browser JavaScript;
- positive and negative authorization tests;
- export round-trip checks sufficient to establish that archives are readable and contain current artifacts/history;
- deletion tests proving participant-owned source data is not accidentally destroyed by project lifecycle operations;
- XSS/injection regression coverage for user-controlled presentation data;
- clear error states for failed uploads, invitations, mutations, and migrations;
- review of limits for upload size, project size, invitation lifetime, and obvious abuse cases.

`AGENTS.md` defines the minimum operating discipline for coding agents working on these surfaces.

## Explicitly beyond this MVP

Unless implementation reveals a hard dependency, defer:

- general direct messaging;
- social feeds/following;
- reputation or compatibility scoring;
- semantic search;
- autonomous matching or coordination;
- automatic project-governance decisions;
- elaborate custom role systems;
- per-document × per-member ACL matrices;
- arbitrary agent write access;
- self-modifying production infrastructure;
- a universal ontology;
- THREAD/relation-layer integration.

These may become useful later. They should not prevent Loom from first becoming a small, coherent, portable environment in which humans can own a corpus, deliberately share it, collaborate around project-owned and participant-owned artifacts, and expose those structures safely enough for agents to begin reading them.
