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

## Corpus manifest

A user's corpus should expose a structured overview that allows humans and agents to discover what information exists without retrieving the entire corpus.

This manifest can function as a structured table of contents, containing document locations and concise information useful for deciding what should be retrieved.

The earlier idea of a compact introduction medley can naturally extend into this corpus-wide discovery mechanism.

## AI-assisted manifest maintenance

Loom may use AI to help maintain the corpus manifest as documents are created, changed, moved, or removed.

AI assistance should maintain or propose descriptions, classifications, tags, or other discovery information rather than making the underlying corpus dependent on an AI-generated ontology.

The manifest itself should remain inspectable and editable.

## History and provenance

Ordinary change history should provide the primary provenance mechanism rather than introducing a separate provenance subsystem.

Where useful, revisions should record enough structured information to distinguish changes made by a human, an agent, an import, or Loom itself, and to identify a source artifact when a change is derived from another Loom artifact.

## Deletion semantics

Deleting or revoking access to an artifact prevents future access where possible. It does not attempt to revoke information that another human or agent has already received.

Once information has been read, copied, summarized, transformed, or used to produce other work, Loom cannot reliably undo those consequences.

Loom should therefore avoid cascading deletion or other mechanisms that imply stronger revocation guarantees than the platform can actually provide.

Permissions and sharing interfaces should make this limitation clear enough for users to make informed decisions before sharing.

## Changelog

Loom should maintain a changelog as the project evolves.

The changelog records meaningful changes to Loom itself—features, behavior, interfaces, compatibility, and other externally relevant changes—rather than serving as the provenance history of individual user artifacts.

Artifact-level history and the project changelog are separate concerns.
