# Document Lifecycle and Compression Revisions

This document defines the shared document identity, revision, and derived-compression model for participant-owned and project-native documents. It is normative for the compression/versioning slice; it does not claim that the target model is already implemented.

Ownership and access remain governed by [CONTRIBUTION_LIFECYCLE.md](./CONTRIBUTION_LIFECYCLE.md), [PROJECT_NATIVE_DOCUMENTS.md](./PROJECT_NATIVE_DOCUMENTS.md), and [PROJECT_LIFECYCLE.md](./PROJECT_LIFECYCLE.md). Machine retrieval follows [AGENT_ACCESS.md](./AGENT_ACCESS.md).

## Implementation status

As of 2026-09-03, the repository has:

- stable document IDs, full-content revisions, and a current-version reference;
- metadata events separate from content revisions;
- a nullable `documents.compression` field, introduced by migration 0009;
- participant and project-native metadata APIs that accept manually supplied compression text up to 2,000 characters;
- compression editing code in the participant document details and project-native document details UI;
- compression in authorized document and agent responses.

These existing metadata events can record compression changes, but do not establish which full-text revision a compression describes. There is no dedicated compression-revision identity, source-version binding, or current/stale contract. Automatic AI generation is not implemented.

The current UI presents compression as an unnamed field inside document details. The compression/versioning slice must make it an explicit first-class UI section and provide a standard copyable generation prompt.

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
- its creator/saving actor through existing provenance mechanisms;
- the generation-prompt version used when known.

Use the source revision ID as the authoritative relationship. Human-readable version numbers are display information, not globally unique references.

Saving an edited or replacement compression creates a new compression revision. Earlier compressions remain inspectable history while the underlying document exists and access permits. Do not implement this as repeated in-place overwriting of the only compression text.

The first slice needs one selected compression per document plus its history. Simultaneous competing candidates, ranking, and AI orchestration are later work.

Document and compression revision counters must remain independent. A compression revision points to the source document revision it describes; do not imply that compression revision N necessarily corresponds to document revision N.

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

## Standard manual generation prompt

Before Loom performs native model calls, the manual workflow is the reference implementation for compression generation. The UI must provide a small explanation and a one-click copy control for a repository-owned prompt above the editable compression field.

The human-facing section name is **Agent compression**. Its short explanation should communicate that this is a compact semantic representation that agents can use to judge relevance before retrieving full document content.

The initial prompt version is `compression-prompt-v1`:

```text
Create a concise semantic compression of the document below for an AI agent that must decide whether the full document is relevant.

Preserve:
- the document’s main subject and purpose;
- important entities, concepts, decisions, constraints, and unresolved questions;
- distinctions or caveats that materially affect interpretation.

Do not:
- add information not present in the document;
- turn it into a generic summary or prose introduction;
- omit important limitations merely to make it shorter.

Write compact factual prose intended for retrieval and triage, not for a human-facing abstract.

Return only the compression text, with no heading, commentary, or explanation.

DOCUMENT:
[paste full document here]
```

Keep the canonical prompt in one repository-owned source and reuse it from UI code rather than maintaining divergent copies. A future prompt wording change must receive a new prompt version rather than silently redefining the meaning of an existing version.

The copy action copies only the prompt template. The user remains responsible for placing the intended document content into the external LLM interaction and reviewing the result before saving it to Loom. This slice does not send document content to any model or third-party service.

## Manual workflow and document UI

The first usable workflow is:

1. Open the document and identify its current full-text version.
2. In the **Agent compression** section, read the short explanation or tooltip and copy `compression-prompt-v1`.
3. Run that prompt with the intended full document in an external LLM if desired.
4. Review and paste the resulting compression into the Loom compression field.
5. Save it against the full-text revision actually used.
6. Show the selected compression, source version, current full-text version, freshness, timestamp, and available actor provenance together.

For example: “Agent compression · Stale — based on document v7; document is now v9.” A current compression should likewise make the source/current relationship visible without requiring the user to inspect history.

Provide discoverable editing and compression history in both participant-owned and project-native document views where existing authority permits them. Keep the current 2,000-character limit for this slice.

The saving participant is not automatically the authoring model. Do not invent model identity or generation provenance for pasted text. The prompt version may be recorded because Loom supplied that recipe, but this does not prove that the user actually used it or identify the external model. Verified generator details can be added later.

Saving an edited/replacement compression from the current document view means the user is asserting that the new compression describes the current full-text revision, and the save operation should bind it to that revision. If the document changed between opening the page and committing the compression, do not silently bind the result to the newer revision: detect the mismatch and report a conflict or preserve the explicitly submitted source revision, according to the existing update architecture, while keeping freshness truthful.

Editing a stale compression and saving it from the current document view creates a new compression revision bound to the current full-text revision. Historical compression revisions are not edited in place.

A metadata-only document edit does not stale compression. Only a new full-content revision changes the source/current relationship.

## Compression history

Compression history is content-bearing history and must be inspectable now. Restoration/reversion of an older compression is not required in this slice.

The existing document history UI may be extended rather than building a separate history product, but it must let an authorized human distinguish compression revisions from content and metadata events and inspect the historical compression text, source document version when known, timestamp, actor provenance when known, and prompt version when known.

Do not leak historical compression text through metadata-only views or lifecycle shells.

## Access, history, and deletion

Compression editing follows the document's existing edit authority; it grants no new ownership, membership, or agent write capability. Project archive and account/project deadlines remain authoritative at mutation time.

All compression text, including previous values in history/events, follows current content access rules. Metadata/history visibility alone does not authorize disclosure of semantic compression text. In particular, metadata-only human views of agents-only material must not leak compression through history.

Retraction or permission loss blocks future compression access through the affected project just as it blocks body access. It does not delete a still-owned participant source or its private history.

When the document is deleted, its compression text and content-bearing compression history must be deleted with it. Do not retain these in shells, manifests, metadata-event payloads, or hidden duplicate records merely to preserve provenance. Minimal non-content provenance follows existing lifecycle policy.

Project-owned copies remain independent. This slice need not copy compressions; if added later, it must not reuse a source document's version ID as the copy's own source revision or claim freshness without an explicit valid mapping.

## Agent API contract

Once implemented, discovery and document retrieval must expose enough structured information to relate the selected compression to the full text: current full-text revision ID, compression revision ID, source revision ID, freshness, and permitted provenance/timestamps.

A caller must be able to distinguish missing, stale, and unknown compression from current compression without inferring this from timestamps or prose. Return the text only when current content access permits it. Compute the source/current relationship from a consistent read so concurrent updates cannot yield a falsely current result.

Introduce this contract deliberately alongside the existing nullable compression string; do not silently change its JSON type. Exact endpoint and additive field names belong to the bounded implementation assignment.

This slice establishes the data contract needed for later agent retrieval but does not add new GPT Action document-read operations.

## Acceptance requirements for the implementation slice

Use the operation/state model in [TESTING_MODEL.md](./TESTING_MODEL.md). Cover:

- both participant-owned and project-native document UIs showing a named **Agent compression** section, explanatory help, copyable canonical prompt, and source/current version status;
- the copied prompt exactly matching the repository-owned `compression-prompt-v1` template;
- saving compression for a known current revision, then editing only the compression;
- a full-text update making the selected compression stale without destroying its history;
- editing/saving a stale compression creating a new revision bound to the current document revision;
- metadata-only edits leaving the source binding and freshness unchanged;
- missing and legacy-unknown compression remaining distinguishable;
- source revision validation rejecting another document's revision or a nonexistent revision;
- concurrent full-text edits preserving truthful source binding and freshness;
- compression history remaining inspectable while old values are not edited in place;
- permitted participant/project editors saving, and unauthorized or no-longer-authorized actors being denied;
- archive, retraction, audience, account deadline, and deletion behavior, including history text;
- migration of populated legacy data without fabricated provenance, fabricated source binding, or lost text;
- agent responses accurately exposing alignment without widening disclosure;
- the current 2,000-character compression limit remaining enforced.

Automatic model calls, agent document writes, GPT Action document reads, compression restoration, competing compression candidates, ranking/orchestration, and verified external-model provenance are outside this slice.
