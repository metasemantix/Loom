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

## Projects are link corpora

A project or collaboration should primarily reference participant-owned artifacts rather than storing duplicate project-owned copies of them.

Explicitly adding a document to a project makes the source artifact part of that project's shared discovery corpus while ownership remains with the participant. Deleting the source removes its project presence rather than leaving a hidden duplicate behind.

This preserves meaningful participant-controlled deletion while allowing agents to traverse shared project material.

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

## Intentional sharing should not require manual identifiers

Loom should preserve explicit user intent at consequential sharing boundaries without requiring humans to manipulate internal database identifiers as the normal interface.

Linking a document to a project should remain an explicit action, but the ordinary UI should present a human-readable document picker rather than requiring a pasted document ID. The confirmation or action that grants project access is the meaningful consent boundary.

Similarly, stable participant IDs and short lookup identifiers are useful for provenance and unambiguous lookup, but should not be the primary mechanism for routine human interaction. Human-facing participant discovery should prefer names/search plus explicit confirmation or invitation, while retaining IDs as an advanced or disambiguating mechanism.

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
