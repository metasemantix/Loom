# Project-native documents

This document defines the settled ownership, permission, lifecycle, provenance, and deletion semantics for documents owned by a Loom project.

A **project-native document** is owned by the project itself. It is not a participant-owned document that happens to be linked or contributed to a project.

These semantics are normative for the project-native-document implementation slice.

## Core distinction

Loom has two fundamentally different ways for participant material to appear in a project:

1. **Contribute/link a participant-owned document.** The participant remains the source owner. Existing contribution lifecycle semantics apply, including retraction and suspension after removal.
2. **Create or copy a project-native document.** A new document is owned by the project itself and follows the rules in this document.

Do not collapse these into one relationship or silently convert one into the other.

## Ownership and identity

A project-native document is project-owned from the moment it is created.

- The document has its own stable document ID.
- The owning project is authoritative for ordinary document governance.
- `created_by` records the participant who caused the document to exist, but does not imply participant ownership.
- Each later revision records its own actor/authorship provenance.
- There is no special mutable set of document authors. Authorship beyond creation is represented by revision/activity history.
- Project-native documents do not become participant-owned because the creator leaves, is removed, changes role, or deletes their account.
- There is no initial ownership-transfer primitive back to a participant. A participant may make a separate copy instead.

Project ownership and participant authorship/provenance are separate concerns.

## Creation and ordinary use

While a project is active, current owners, admins, and ordinary members may:

- create project-native documents;
- edit document content;
- rename/move documents and perform ordinary document metadata/organization changes.

Ordinary editing does not change ownership and does not create permanent deletion authority for editors.

A project-native document does not gain a second personal `Public`/`Private` visibility model. Its readable audience is determined by project access/audience semantics. Existing `agents_only` or equivalent project audience rules continue to apply: body visibility and metadata/history visibility remain separate surfaces.

## Creator deletion entitlement

Creation grants the creator a temporary exceptional right to delete the project-owned document.

The entitlement lasts **exactly 72 hours** from creation.

Store the concrete deadline, for example as `creator_deletion_until`, rather than relying forever on `created_at + current policy duration`. A later policy change must not silently rewrite previously granted entitlements.

During the entitlement window:

- the creator may delete the project-owned document immediately;
- editing the document does not reset or extend the deadline;
- edits by other project participants do not reset, shorten, or cancel the deadline;
- document deletion is immediate and has no second grace period.

At the deadline, the exceptional creator deletion authority expires. Treat the deadline as a hard authorization boundary: before it the entitlement exists; at or after it the entitlement does not.

After expiry, deletion follows normal project governance: owner/admin may delete; an ordinary member or former creator may not delete merely because they created or edited the document.

## Membership loss must not defeat the creator entitlement

The 72-hour creator deletion entitlement is intentionally independent of current project membership.

If the creator voluntarily leaves or is administratively removed/kicked during the 72-hour window:

- the project-native document remains available to the project according to normal project rules;
- the creator loses ordinary project membership, read, and edit authority;
- the creator **retains the exceptional right to delete that document until the original fixed deadline**.

Project leadership must not be able to acquire irrevocable control sooner by removing the creator.

The backend authorization rule for this exceptional operation must therefore be conceptually based on:

`creator identity + document identity + creator_deletion_until`

and not on:

`creator identity + current project membership + creator_deletion_until`.

The UI must provide an appropriate participant-side/former-member-accessible surface for exercising a still-valid creator deletion entitlement without restoring ordinary project access.

Do not introduce a freeze/regrant state merely because membership ended. The entitlement simply survives until its predetermined expiry.

## Normal deletion authority

Outside the temporary creator entitlement:

- project owner may delete project-native documents;
- project admins may delete project-native documents;
- ordinary members may not delete project-native documents merely because they created or edited them;
- former creators have no permanent deletion authority after the 72-hour deadline.

Deletion of an individual document is immediate. Loom's scheduled grace-period semantics are for higher-level shells such as accounts/projects where intentionality warrants them; individual document data does not receive another nested deletion grace period.

## Voluntary leave and administrative removal

Project-native documents do not use participant contribution lifecycle states.

On voluntary leave or administrative removal:

- project ownership remains unchanged;
- the document remains in the project corpus;
- there is no retraction, source-owner suspension, or source-body availability transition;
- ordinary former-member project access ends;
- any unexpired creator deletion entitlement remains exercisable until its fixed deadline.

This differs deliberately from participant-owned contributions.

## Archive semantics

An archived project is read-only according to the existing project lifecycle rules.

Therefore project-native documents in an archived project:

- remain readable according to the project's existing access/audience policy;
- cannot be created, edited, renamed, moved, or otherwise mutated through ordinary project authority;
- may not be normally deleted by owner/admin while archive rules forbid project mutation unless the broader lifecycle policy explicitly permits it.

The exceptional creator deletion entitlement remains exercisable during its existing 72-hour window even if the project is archived. Archive must not silently extinguish a previously granted creator lifecycle right.

This exception is analogous to other self-directed lifecycle operations that remain available while project collaboration is frozen.

## Creator account deletion

The project owns the document, not its creator's account.

If the creator schedules account deletion, the project-native document remains intact.

When the creator reaches the account deletion hard deadline:

- the participant can no longer exercise the personal creator deletion entitlement because the account authority no longer exists;
- the document remains project-owned and available according to project state/access rules;
- creator/revision provenance follows the existing deleted-participant tombstone model;
- the document must not become unavailable merely because its creator was deleted.

No ownership transfer occurs because the project already owns the document.

## Copy to project versus contribute to project

The product and backend must keep these operations explicit and separate.

### Contribute/link participant-owned document

Existing contribution semantics apply:

- participant retains source ownership;
- contribution relationship has its own availability/lifecycle state;
- participant may later retract;
- removal may suspend project access to the participant-owned body;
- source deletion affects project availability according to contribution lifecycle rules.

### Create project-owned copy

Copying a participant-owned document into a project creates a **new project-native document**:

- new stable document ID;
- project ownership from creation;
- independent revision history from creation onward;
- origin provenance pointing to the source document/participant where appropriate;
- no future synchronization with the source;
- later changes to the source do not propagate to the project copy;
- later changes to the project copy do not propagate to the source;
- later source retraction/deletion/privacy changes do not delete or alter the project-owned copy.

The participant who performs the copy is the creator of the new project-native document and receives the normal 72-hour creator deletion entitlement.

Because copying crosses an ownership boundary, the UI must clearly distinguish it from contribution/linking and provide an intentional confirmation that the resulting copy belongs to the project and becomes independent of the source.

## Export

Project export should include project-native documents according to normal project export/access rules.

A participant's personal account export must not include project-owned document bodies merely because that participant created or edited them. Authorship/activity/provenance relating to the participant may appear where appropriate, but project ownership must not be confused with personal data ownership for export purposes.

## Activity, revision history, and provenance

Use Loom's existing provenance/history mechanisms rather than creating a parallel subsystem.

At minimum, project-native document history/activity should preserve as appropriate:

- stable document ID;
- document creation;
- creator provenance;
- revision actors;
- rename/move/metadata events where ordinary document history already represents them;
- deletion actor and authority path where useful;
- source-document provenance when created as a project-owned copy.

Deleted participants resolve through the existing immutable participant provenance/tombstone model and `former user` display behavior. Do not retain a deleted participant's old mutable display name merely to make project-native history convenient.

## Project deletion

Project deletion is explicitly **out of scope for this slice**.

The only assumption required now is:

> Project-native documents belong to the project and therefore ultimately follow the project's deletion lifecycle.

The exact project deletion grace period, shell/tombstone preservation, final manifest, and destruction of project-owned document bodies belong to the dedicated project-deletion slice.

## Authorization and race-safety requirements

UI gating is not authorization.

All lifecycle and permission invariants must be enforced server-side at the mutation/commit boundary. In particular, do not authorize based only on an earlier read of membership, project state, account state, or deletion deadline.

Race-sensitive cases include:

- creator entitlement expiring while a delete request is in flight;
- creator leaving or being removed while deletion is in flight;
- project being archived while create/edit/copy/delete is in flight;
- actor role changing while a mutation is in flight;
- creator account crossing its hard deletion deadline while an exceptional delete request is in flight.

A request that began while authorized must not commit after its relevant authority has expired or project state has changed.

## Required test coverage

Add positive and negative coverage for at least:

- owner/admin/member can create project-native documents while active;
- project-native documents have stable project ownership distinct from `created_by`;
- owner/admin/member can perform permitted ordinary edits while active;
- ordinary member cannot normally delete after creator entitlement expiry;
- owner/admin can normally delete while active;
- creator can delete before the 72-hour deadline;
- creator cannot delete at or after the exact deadline unless separately authorized as owner/admin;
- editing does not reset the creator deletion deadline;
- other participants editing does not affect the creator deletion deadline;
- creator can exercise the entitlement after voluntary leave;
- creator can exercise the entitlement after administrative removal;
- former creator does not regain ordinary project read/edit authority merely to exercise deletion;
- archive blocks ordinary project-native mutations;
- archive does not extinguish a still-valid creator deletion entitlement;
- creator account deletion leaves the project document intact and removes personal entitlement at the hard account deadline;
- deleted-creator provenance resolves through existing tombstone semantics;
- project-owned copy receives a new document ID and independent revision history;
- source edits/deletion/retraction do not mutate or delete a project-owned copy;
- contributing/linking remains governed by existing participant-owned contribution semantics;
- project export includes project-native bodies when caller access permits;
- personal account export does not absorb project-owned bodies merely through authorship;
- existing participant-owned document and contribution behavior remains unchanged.

Include exact-boundary and race-sensitive tests where the implementation structure allows them.
