# Design Decisions

This document records architectural and product decisions that should survive beyond individual discussions. These decisions may later be incorporated into more specific architecture, protocol, or implementation documents.

## Portability and export

User data must remain freely exportable.

A Loom space should be exportable in a form that remains useful without Loom itself. Human-readable documents should remain human-readable, and structured metadata should use ordinary portable formats.

Export is a core cloud-storage capability rather than a later interoperability feature.

A complete export should contain enough information to reconstruct the user's Loom corpus, including its relevant structure and metadata.

## Multiple clients

Loom is infrastructure rather than a canonical user interface.

The generic Loom interface is one client. Specialized applications may provide alternative interfaces and functionality over the same Loom data.

For example, Oscar could act as a Loom client while adding application-specific features such as shopping-list handling.

## Bounded agent operations

Agents should eventually be able to perform narrowly scoped, explicitly permitted operations without requiring unrestricted write access to the underlying data.

For example, an agent could be permitted to add structured items to a shopping list without receiving permission to arbitrarily rewrite that list or other documents.

The exact capability and permission protocol remains an architectural question for later design.

## Ownership, organization, discovery, access, and capability are separate

Loom should model these as separate axes rather than encoding one in another.

- Ownership determines who controls the source artifact and its deletion.
- Folder/path structure is for human organization.
- Project membership describes collaboration context.
- Discovery surfaces describe which artifacts are advertised to a caller.
- Read permissions determine which artifacts may actually be retrieved.
- Write permissions and bounded capabilities determine which changes or operations an actor may perform.

A folder must not implicitly become a security boundary, manifest membership must not itself be treated as an access grant, and project inclusion must not imply arbitrary write authority.

## Document visibility is mutable

Visibility must not be frozen at document creation.

Owners should be able to change an existing artifact's visibility, including ordinary public/private changes, without recreating the document. Changes to visibility should be reflected by relevant discovery surfaces and access checks.

## Corpus manifests and discovery surfaces

A corpus should expose structured overviews that allow humans and agents to discover what information exists without retrieving entire document bodies.

There need not be one universal manifest. Loom may expose multiple named discovery surfaces, including a public manifest and manifests associated with individual projects or collaborations. A document may appear in zero, one, or several manifests.

A manifest is a view over the corpus, not a second copy of the corpus and not an access-control list. Membership says that an artifact may be advertised through that discovery surface; the caller's permissions still determine whether it can be discovered or retrieved.

Manifest projections should therefore be caller-aware and must not leak private artifact metadata to callers who lack discovery access.

The earlier idea of a compact introduction medley can naturally extend into these structured tables of contents.

## AI-assisted manifest maintenance

Loom may use AI to help maintain discovery metadata and manifest membership as documents are created, changed, moved, or removed.

AI assistance should maintain or propose descriptions, classifications, tags, or other discovery information rather than making the underlying corpus dependent on an AI-generated ontology.

Manifests and their metadata should remain inspectable and editable.

## Projects are link corpora and may own native artifacts

A project or collaboration should primarily reference participant-owned artifacts rather than storing duplicate project-owned copies of them.

Explicitly adding a participant-owned document to a project makes the source artifact part of that project's shared discovery corpus while ownership remains with the participant. Deleting the source removes its project presence rather than leaving a hidden duplicate behind.

Projects may also own artifacts that are genuinely project-native: shared notes, decisions, specifications, generated manifests, meeting records, or other material intended to belong to the collaboration rather than to whichever participant happened to create it.

Creation or upload should therefore be able to choose an ownership destination such as `My Space` or an eligible project. Project-owned artifacts have their own identity and revision history and do not become participant-owned merely because one participant created the first revision.

Participant-owned and project-owned artifacts must remain distinguishable. Participant-owned material should remain the default unless project ownership is deliberately chosen.

## Linking, copying, and ownership

Linking and copying into a project have different semantics and should remain distinct operations.

- **Link to project:** the participant retains ownership. The project receives the access defined by its policy, and removing the link or leaving the project withdraws future project access where possible.
- **Copy to project:** Loom creates a new project-owned artifact with a new identity and its own revision history. The participant's original remains unchanged and independently owned.

A project copy must preserve provenance pointing back to its source where applicable.

Copying is an ownership-boundary event. The UI must clearly warn that once the project-owned copy is created, it is outside the original owner's sole control. Deleting, editing, making private, or otherwise changing the original does not revoke or alter the project copy.

A dedicated ownership-transfer primitive is not required initially. A participant who wants the practical effect of transfer may deliberately copy an artifact into the project corpus and then separately decide whether to retain or delete their original.

## Project access defaults

Explicitly adding an artifact to a project should normally grant discovery and read access according to that project's access policy rather than requiring the owner to grant every project agent individually.

Project-level defaults should carry most of the permission burden. Per-document exceptions may be added when real use cases require them rather than making fine-grained ACL management the default workflow.

Read access and write authority remain separate. Inclusion in a project may grant read access without granting arbitrary editing rights.

Projects may choose whether linked corpus material is directly readable by project members and their authorized agents or by authorized agents only.

Whether agents that join a project later automatically inherit access to the existing project corpus should be an explicit project-level policy; automatic inheritance is a reasonable default.

## Project membership is consensual

A participant should not become a project member merely because another participant knows their ID or selects them from a lookup result.

Project membership should be established through an invitation that the recipient explicitly accepts. Opening an invitation link is not itself acceptance; the recipient should be able to inspect enough project context to understand what they are joining before choosing to join.

Leaving a project or being removed from it should withdraw future project access granted through that membership. Participant-owned documents previously linked by the departing member should cease to be shared through the project while remaining intact in the participant's own corpus.

## Project administration and continuity

A project has an owner and may have creator/owner-chosen administrators. How many administrators to appoint and whom to trust is a project governance choice rather than something Loom should infer automatically.

The owner should be able to transfer ownership deliberately. Loom should not automatically promote an arbitrary member merely because the owner becomes unavailable.

Administrators provide continuity for ongoing projects when the owner is absent and may perform explicitly defined project-management operations. Destructive authority such as project deletion should remain narrower than ordinary administration unless project policy later defines otherwise.

Project-owned artifacts belong to the project rather than to its current owner or administrators. They therefore survive the disappearance, departure, or replacement of an individual project owner unless the project itself is deleted or archived according to project lifecycle policy.

Loss of activity or of an external authentication provider is not evidence that a Loom participant has abandoned a project. Loom must not automatically transfer project authority merely because an owner has not signed in or because a connected provider disappears.

## Project lifecycle: active, archived, shell

Projects have three conceptually distinct lifecycle states:

- **Active:** normal collaboration. Subject to permissions, members may collaborate, link or create material, invite participants, administer the project, and later allow authorized agents to perform permitted mutations.
- **Archived:** the collaboration is frozen/read-only. The project remains recognizable and readable according to existing access rules, but forward collaborative activity is suspended.
- **Shell:** the active collaboration and corpus are gone. Only the minimal historical record needed for provenance and reference resolution remains. A shell is the result of project deletion and cannot be unarchived.

Archiving freezes collaboration, not participant-owned data. It must not snapshot, duplicate, or otherwise preserve access to participant-owned source content independently of its owner.

## Archived projects are read-only collaboration spaces

Archiving should disable forward project activity, including new invitations or members, new document links/additions, project-owned document creation, document/project mutations, and future agent mutations or capabilities that would change the project.

Administrative powers are dormant while a project is archived. Owners and administrators do not continue ordinary project administration merely because their historical roles remain recorded.

Self-directed withdrawal remains available while archived:

- any member may leave;
- a participant may retract their own participant-owned document links at any time;
- source owners retain all ordinary control over their participant-owned artifacts outside the project.

Archiving must never make a participant-owned contribution irrevocable. Retraction of a participant-owned project link is permitted while the project is active or archived.

When a project is archived, current members should receive a Loom notification. Participant-owned documents that remain linked to an archived project should be visibly marked in the owner's document overview so the owner is reminded that the contribution remains shared and may retract it.

Archiving does not automatically retract participant-owned contributions on anyone's behalf.

## Archived-project succession and reopening

An archived project with an active owner may be explicitly unarchived by the owner. Where project policy permits, an existing administrator may also unarchive while the owner remains present, without changing ownership.

If an archived project becomes ownerless through deliberate account deletion, an administrator who was already appointed before archival may explicitly reopen it. Reopening in this ownerless case is also the succession event: that administrator becomes the new owner.

Until an administrator explicitly performs that operation, they remain only the recorded administrator of a frozen project and have no implicit ownership authority.

An ownerless archived project with no existing administrator cannot be seized or reopened by ordinary members. It remains archived. Loom should not infer a successor or automatically promote a member.

## Account deletion and owned projects

Voluntary account deletion must deal explicitly with every active project owned by the departing participant rather than silently orphaning it.

For each owned active project, the owner must choose a coherent disposition before account deletion completes, such as:

- deliberately transfer ownership to an existing member (appointing/promoting as necessary), allowing the project to continue active;
- archive the project, allowing any already-appointed administrator to become a possible explicit successor later under the archived-project reopening rule;
- delete the project, leaving only its provenance shell.

If there is no suitable successor, Loom must not invent one merely to permit account deletion.

A project whose owner simply becomes inactive remains owned by that participant; inactivity alone does not trigger these account-deletion rules.

## Project deletion leaves a provenance shell

Deleting a project should terminate the active collaboration without deleting participant-owned source artifacts.

Deletion should revoke active project access, invalidate outstanding invitations, remove project-document links, and remove project-owned document bodies according to the project's deletion policy.

Loom should retain a minimal historical project record — a shell rather than a functioning project — so historical provenance does not collapse into an unresolvable identifier. This record may retain the stable project identity, former name, creation/deletion timestamps, and former membership/role information sufficient to understand historical references.

The retained shell must not remain a usable collaboration space, confer permissions, or preserve document bodies merely for convenience.

Project history/events may remain as provenance data where they are required to make the shell intelligible, but operational data and corpus content must not survive merely to make deletion easier to implement.

A shell is terminal. It cannot be reopened or converted back into an active project.

## Intentional sharing should not require manual identifiers

Loom should preserve explicit user intent at consequential sharing boundaries without requiring humans to manipulate internal database identifiers as the normal interface.

Linking a document to a project should remain an explicit action, but the ordinary UI should present a human-readable document picker rather than requiring a pasted document ID. The confirmation or action that grants project access is the meaningful consent boundary.

Similarly, stable participant IDs and short lookup identifiers are useful for provenance and unambiguous lookup, but should not be the primary mechanism for routine human interaction. Human-facing participant discovery should prefer names/search plus explicit confirmation or invitation, while retaining IDs as an advanced or disambiguating mechanism.

## Preflight review before irreversible sharing

Before creating a project-owned copy from participant-owned material, Loom should provide a strong confirmation that explains the loss of sole control and the independence of the resulting copy.

Loom may additionally offer a preflight review for likely accidental oversharing. Deterministic checks should handle recognizable secrets, credentials, dangerous markup, and similar patterns where practical. AI-assisted review may flag semantically sensitive or unexpectedly unrelated passages that deterministic checks cannot reliably identify.

Such review should be advisory by default: surface specific findings for the participant to inspect and allow an informed decision rather than silently rewriting content or making opaque ownership decisions on the participant's behalf. Security policy may separately block material that is unsafe for the platform itself.

## Stable participant identity

A participant's Loom identity should not depend on a mutable display name or external authentication provider.

Display names may change while the underlying participant identity remains stable. A short, human-usable representation of that stable identity may be exposed for provenance and identity lookup, but should not be displayed everywhere as part of normal social presentation.

Revision history and other provenance surfaces should remain capable of distinguishing historical actors even when an account is later removed. Deleted accounts should not collapse into one indistinguishable generic identity. A future deletion/anonymization policy may preserve a censored former display name together with the stable provenance identifier where appropriate.

## History and provenance

Ordinary change history should provide the primary provenance mechanism rather than introducing a separate provenance subsystem.

Where useful, revisions should record enough structured information to distinguish changes made by a human, an agent, an import, or Loom itself, and to identify a source artifact when a change is derived from another Loom artifact.

Agent activity should likewise remain inspectable once agents can read, change, or invoke capabilities against participant data.

## Deletion semantics

Deleting or revoking access to an artifact prevents future access where possible. It does not attempt to revoke information that another human or agent has already received.

Once information has been read, copied, summarized, transformed, or used to produce other work, Loom cannot reliably undo those consequences.

Loom should therefore avoid cascading deletion or other mechanisms that imply stronger revocation guarantees than the platform can actually provide.

Permissions and sharing interfaces should make this limitation clear enough for users to make informed decisions before sharing.

## Uploaded artifacts preserve their source

Loom should support file upload rather than requiring all corpus material to be manually pasted into text fields.

Where practical, an uploaded artifact should remain available in its original form. Text extraction, summaries, AI-readable projections, thumbnails, or other derived representations should not silently replace or destroy the source artifact.

## Content security and untrusted corpus data

Content that may later be consumed by an agent should be treated as untrusted data rather than trusted instructions merely because it is stored in Loom.

New or changed artifacts should eventually pass through a content security gate capable of detecting suspicious material such as prompt injection, code or script injection, hidden instruction text, suspicious encoded payloads, dangerous markup, poisoned retrieval content, and accidentally exposed secrets.

Deterministic checks should be preferred where possible. AI-assisted semantic scanning may complement them for threats that depend on meaning or context, such as instructions intended to override an agent's trusted instructions or induce unsafe tool use or context exfiltration.

Security scanning should report findings and support outcomes such as clean, suspicious, or blocked. It should not silently rewrite user content.

Trusted agent instructions and capabilities should remain separate from retrieved corpus content. Security scanning is an additional defense and does not make arbitrary stored or shared content inherently trustworthy.

The exact scanning pipeline, enforcement rules, and review process remain architectural questions for later design and may warrant a dedicated security document.

## Direct messaging is not a prerequisite

User-to-user direct messaging is not required for Loom's core coordination model.

Adding general messaging would also introduce blocking, spam prevention, reporting, moderation, notification, retention, and unsolicited-contact policy. Contact requests and collaboration invitations may satisfy the immediate coordination need with substantially less platform machinery.

Direct messaging can be reconsidered if concrete use cases require conversation to remain inside Loom.

## Changelog

Loom should maintain a changelog as the project evolves.

The changelog records meaningful changes to Loom itself—features, behavior, interfaces, compatibility, and other externally relevant changes—rather than serving as the provenance history of individual user artifacts.

Artifact-level history and the project changelog are separate concerns.
