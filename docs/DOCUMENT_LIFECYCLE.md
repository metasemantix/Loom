# Document Lifecycle and Compression Revisions

This document defines the shared document identity, revision, and derived-compression model for participant-owned and project-native documents. It is normative for the next compression/versioning slice; it does not claim that the target model is already implemented.

Ownership and access remain governed by [CONTRIBUTION_LIFECYCLE.md](./CONTRIBUTION_LIFECYCLE.md), [PROJECT_NATIVE_DOCUMENTS.md](./PROJECT_NATIVE_DOCUMENTS.md), and [PROJECT_LIFECYCLE.md](./PROJECT_LIFECYCLE.md). Machine retrieval follows [AGENT_ACCESS.md](./AGENT_ACCESS.md).

## Implementation status

As of 2026-09-02, the repository has:

- stable document IDs, full-content revisions, and a current-version reference;
- metadata events separate from content revisions;
- a nullable `documents.compression` field, introduced by migration 0009;
- participant and project-native metadata APIs that accept manually supplied compression text up to 2,000 characters;
- compression editing code in the participant document details and project-native document details UI;
- compression in authorized document and agent responses.

These existing metadata events can record compression changes, but do not establish which full-text revision a compression describes. There is no dedicated compression-revision identity, source-version binding, or current/stale contract. Automatic AI generation is not implemented.

The reported difficulty finding the field is a UI discoverability/verification issue, not evidence that storage or all UI code is missing. Verify both rendered document paths against the deployed version when implementing the next slice.

## Stable document identity and full-text revisions

A document retains its stable ID across content edits, title changes, and organization changes. A full-text edit creates a new immutable content revision with its own ID, document-local version number, timestamp, and actor provenance. The document points to its current content revision.

Metadata changes retain their own inspectable provenance without manufacturing a full-text revision. Content revision history, metadata history, and project corpus/lifecycle history answer different questions and must remain distinguishable.

A contribution references the same source document. An explicit project-owned copy creates a new document and independent revision history under the existing copy rules.

## Compression is versioned derived content

A compression is a concise semantic description used to decide whether to retrieve the full document. It is derived, classified content, not harmless discovery metadata and not a replacement for the source.

Each newly saved compression revision must identify:

- its own stable compression revision ID;
- its owning document ID;
- its text;
- `source_version_id`, referring to a full-text revision of that same document;
- its creation timestamp;
- its creator/saving actor through existing provenance mechanisms.

Use the source revision ID as the authoritative relationship. Human-readable version numbers are display information, not globally unique references.

Saving an edited or replacement compression creates a new compression revision. Earlier compressions remain inspectable history while the underlying document exists and access permits. Do not implement this as repeated in-place overwriting of the only compression text.

The first slice needs one selected compression per document plus its history. Simultaneous competing candidates, ranking, and AI orchestration are later work.

## Freshness is a relationship, not a quality score

For the selected compression, derive status from its source relationship:

| State | Meaning |
| --- | --- |
| `missing` | No selected compression. |
| `current` | Its source revision ID equals the document's current full-text revision ID. |
| `stale` | It is bound to an older full-text revision of this document. |
| `unknown` | A preserved legacy compression has no established source revision. |

A new full-text revision leaves the existing compression text and source binding intact and makes it stale. Do not silently regenerate, hide, or relabel it as current. A metadata-only edit does not change full-text freshness.

“Current” establishes revision alignment only; it does not certify completeness, accuracy, or human review. “Stale” does not establish that the compression is false.

Legacy compression strings must survive migration without inventing a source revision or original creator/timestamp. Record migration provenance separately from known authorship. Unknown legacy bindings remain explicit until a user reviews and saves a new bound revision.

## Manual workflow and document UI

The first usable workflow is:

1. Open a particular full-text revision and identify its version.
2. Write a compression manually or generate it in a separate LLM run.
3. Review and paste the result into an explicitly labelled Compression field.
4. Save it against the full-text revision actually used.
5. Show the selected compression, source version, current full-text version, freshness, timestamp, and available actor provenance together.

For example: “Compression based on v7; current full text v9 — stale.”

Provide discoverable editing and compression history in both participant-owned and project-native document views where existing authority permits them. Keep the current 2,000-character limit for the first slice unless explicitly revised.

The saving participant is not automatically the authoring model. Do not invent model identity or generation provenance for pasted text. Recording verified generator details can be added later.

A document update while an external LLM run or editor is open must not cause the pasted result to be bound silently to the newer revision. Preserve the explicitly submitted source revision, validate that it belongs to the document, and return its actual freshness. Any operation that claims to save against the current revision must check that condition at commit time and report a conflict if it changed.

## Access, history, and deletion

Compression editing follows the document's existing edit authority; it grants no new ownership, membership, or agent write capability. Project archive and account/project deadlines remain authoritative at mutation time.

All compression text, including previous values in history/events, follows current content access rules. Metadata/history visibility alone does not authorize disclosure of semantic compression text. In particular, metadata-only human views of agents-only material must not leak compression through history.

Retraction or permission loss blocks future compression access through the affected project just as it blocks body access. It does not delete a still-owned participant source or its private history.

When the document is deleted, its compression text and content-bearing compression history must be deleted with it. Do not retain these in shells, manifests, metadata-event payloads, or hidden duplicate records merely to preserve provenance. Minimal non-content provenance follows existing lifecycle policy.

Project-owned copies remain independent. The first slice need not copy compressions; if added later, it must not reuse a source document's version ID as the copy's own source revision or claim freshness without an explicit valid mapping.

## Agent API contract

Once implemented, discovery and document retrieval must expose enough structured information to relate the selected compression to the full text: current full-text revision ID, compression revision ID, source revision ID, freshness, and permitted provenance/timestamps.

A caller must be able to distinguish missing, stale, and unknown compression from current compression without inferring this from timestamps or prose. Return the text only when current content access permits it. Compute the source/current relationship from a consistent read so concurrent updates cannot yield a falsely current result.

Introduce this contract deliberately alongside the existing nullable compression string; do not silently change its JSON type. Exact endpoint and additive field names belong to the bounded implementation assignment.

## Acceptance requirements for the implementation slice

Use the operation/state model in [TESTING_MODEL.md](./TESTING_MODEL.md). Cover:

- saving compression for a known current revision, then editing only the compression;
- a full-text update making the selected compression stale without destroying its history;
- metadata-only edits leaving the source binding and freshness unchanged;
- missing and legacy-unknown compression remaining distinguishable;
- source revision validation rejecting another document's revision or a nonexistent revision;
- concurrent full-text edits preserving truthful source binding and freshness;
- permitted participant/project editors saving, and unauthorized or no-longer-authorized actors being denied;
- archive, retraction, audience, account deadline, and deletion behavior, including history text;
- migration of populated legacy data without fabricated provenance or lost text;
- both rendered document UIs saving and reloading compression with visible version information;
- agent responses accurately exposing alignment without widening disclosure.

This documentation update does not replace the current `CODEX_TASK.md`. Automatic generation, agent document writes, and a general-purpose derived-artifact framework are outside this slice.
