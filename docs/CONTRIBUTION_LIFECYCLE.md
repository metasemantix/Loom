# Contribution Lifecycle and Provenance

This document defines how participant-owned documents behave when they are exposed through Loom projects.

## Core invariant

Project membership, document ownership, and contribution presence are independent relationships.

Contributing a participant-owned document does not transfer ownership. Leaving or being removed from a project does not by itself determine whether that participant's documents remain in the corpus.

## Contribution presence

A participant-owned document may be contributed to a project while retaining its stable source-document identity and ownership.

The project relationship records that the document is available through the project corpus under the project's access policy. Loom should not create a hidden duplicate merely because a document was contributed.

## Retraction

A source owner may manually retract their own participant-owned document from a project while the project is active or archived.

Retraction removes project access to the document body. Project provenance should retain an event/tombstone sufficient to establish that a contribution existed and was later withdrawn, without preserving the withdrawn content.

A retracted document may remain represented in project-facing history or document listings by durable non-content metadata such as its title and a clear retracted/unavailable marker.

## Source deletion and retraction

Deletion of the source document and explicit project retraction have different source-side semantics but converge on the same important project-side fact: the contribution is no longer available.

Other project participants do not inherently need to know why the source became unavailable. Loom may preserve the precise cause in owner/system provenance where required without exposing unnecessary source-owner activity to the rest of the project.

Explicit retraction is compatible with later editing of the still-owned source and recontribution. Source deletion is not.

The exact privacy boundary for exposing these causes remains a policy detail, but unavailable content must not be retained merely to explain the distinction.

## Leaving a project

On voluntary leave, Loom should offer the participant an explicit choice between:

- retracting their participant-owned contributions; or
- keeping those documents in the project corpus after membership ends.

Leaving membership does not transfer ownership and does not make remaining contributions irrevocable.

## Removal from a project

A participant may be removed without requiring their cooperation. Their participant-owned contributions may remain in the project corpus according to the chosen/default removal flow, but the source owner retains the right to retract them later.

Loom should persist a notification or owner-facing contribution surface that lets former members find and retract their own documents as a whole after departure/removal.

A participant's own document overview should clearly mark documents that remain contributed to projects of which the participant is no longer a member.

## Former/outside contributors

Project visibility remains membership-gated. A former contributor does not retain project visibility merely because one of their documents remains in the corpus.

For current project members, the project document overview should distinguish documents whose owner is no longer a project member. This is provenance/availability information, not membership restoration.

## Content visibility versus metadata visibility

Document content visibility and document metadata/history visibility are distinct surfaces.

For `agent_only` material, a human project member may still be allowed to see non-content metadata needed to understand the corpus, including:

- document title;
- stable document/contribution reference where appropriate;
- owner/contributor provenance as permitted;
- availability/retraction status;
- metadata/change history.

`agent_only` therefore does not require pretending that the document does not exist. It restricts document content retrieval by the human.

## Titles and metadata history

Document titles are durable metadata and must be treated as potentially sensitive user content. Sharing interfaces should warn users not to place credentials or secrets in titles or other durable metadata.

Title changes during project runtime should appear in metadata/change history independently of viewing the document body. This remains useful and consistent for `agent_only` documents.

When a document becomes unavailable, its tombstone/history should preserve the historical title needed to make project provenance intelligible rather than rewriting history to the source document's later title.

## Recontribution

If a previously retracted document is later contributed to the same project again and retains the same stable document identity, the project changelog may represent this as another availability interval in the same document-project relationship:

`contributed -> retracted -> contributed again`

This preserves the fact that it is the same source document while making periods of non-availability explicit.

A separate contribution identity should be introduced only if the relationship itself develops semantics requiring independent identity; it should not be manufactured merely because the same stable document was re-contributed.

## Project changelog events

Project history should record lifecycle events sufficient to audit corpus composition without retaining withdrawn document bodies. Relevant events include:

- contribution added;
- contribution retracted/became unavailable;
- contribution restored/re-contributed;
- document title/metadata changes visible to the project;
- participant joined;
- participant left;
- participant removed;
- project role changes;
- project archived;
- project unarchived;
- deletion scheduled;
- scheduled deletion cancelled;
- project deletion completed / shell created.

Project lifecycle history is distinct from a document's content revision history.

## Already-disclosed information

Retraction or source deletion removes future Loom-mediated access where possible. It cannot revoke document content already read, copied, summarized, transformed, or placed into a human or agent context while access was valid.

Loom should state this limitation when users share material rather than imply impossible retroactive revocation guarantees.