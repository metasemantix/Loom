# Document Lifecycle and Compression Revisions

This document defines Loom's shared document identity, revision, and derived-compression model for participant-owned and project-native documents. It is the durable normative contract for compression/versioning behavior.

Ownership and access remain governed by [CONTRIBUTION_LIFECYCLE.md](./CONTRIBUTION_LIFECYCLE.md), [PROJECT_NATIVE_DOCUMENTS.md](./PROJECT_NATIVE_DOCUMENTS.md), and [PROJECT_LIFECYCLE.md](./PROJECT_LIFECYCLE.md). Machine retrieval follows [AGENT_ACCESS.md](./AGENT_ACCESS.md).

## Stable document identity and full-text revisions

A document retains its stable ID across content edits, title changes, and organization changes. A full-text edit creates a new immutable content revision with its own ID, document-local version number, timestamp, and actor provenance. The document points to its current content revision.

Metadata changes retain their own inspectable provenance without manufacturing a full-text revision. Content revision history, metadata history, compression history, and project corpus/lifecycle history answer different questions and must remain distinguishable.

A contribution references the same source document. An explicit project-owned copy creates a new document and independent revision history under the existing copy rules.

## Compression is versioned derived content

A compression is a concise semantic description used to decide whether to retrieve the full document. It is derived, classified content, not harmless discovery metadata and not a replacement for the source.

Each newly saved compression revision identifies:

- its own stable compression revision ID;
- its owning document ID;
- its text;
- `source_version_id`, referring to a full-text revision of that same document;
- its creation timestamp;
- its creator/saving actor through existing provenance mechanisms;
- the generation-prompt version used when known.

Use the source revision ID as the authoritative relationship. Human-readable version numbers are display information, not globally unique references.

Saving an edited or replacement compression creates a new immutable compression revision. Earlier compressions remain inspectable history while the underlying document exists and access permits. One compression revision is selected per document; simultaneous competing candidates, ranking, and AI orchestration are later work.

Document and compression revision counters remain independent. A compression revision points to the source document revision it describes; compression revision N does not imply document revision N.

## Freshness is a relationship, not a quality score

For the selected compression, derive status from its source relationship:

| State | Meaning |
| --- | --- |
| `missing` | No selected compression. |
| `current` | Its source revision ID equals the document's current full-text revision ID. |
| `stale` | It is bound to an older full-text revision of this document. |
| `unknown` | A preserved legacy compression has no established source revision. |

A new full-text revision leaves the existing compression text and source binding intact and makes it stale. Do not silently regenerate, hide, or relabel it as current. A metadata-only edit does not change full-text freshness.

“Current” establishes revision alignment only; it does not certify completeness, accuracy, or human review. “Stale” does not establish that the compression is false. In retrieval, a stale compression remains preferable to silently pretending no compression exists, provided its stale status is explicit.

Legacy compression strings survive migration without inventing a source revision or original creator/timestamp. Migration provenance is separate from known authorship. Unknown legacy bindings remain explicit until a user reviews and saves a new bound revision.

## Standard manual generation prompt

Before Loom performs native model calls, the manual workflow is the reference implementation for compression generation. The UI provides a short explanation and a one-click copy control for a repository-owned generation request above the editable compression field.

The human-facing section name is **Agent compression**. Its explanation communicates that this is a compact semantic representation agents can use to judge relevance before retrieving full document content.

Prompt versions are immutable contracts. Do not silently edit an existing prompt version; wording or input-envelope changes that affect the generation request receive a new version.

### `compression-prompt-v1`

`compression-prompt-v1` is retained as historical provenance for compressions already saved with that prompt version. Its canonical template did not state the 2,000-character limit and the UI copy action copied only the template, leaving the human to add document content separately.

Do not rewrite historical `compression-prompt-v1` provenance to v2.

### `compression-prompt-v2`

`compression-prompt-v2` is the canonical prompt for new manual generation after this change:

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

The compression must not exceed 2,000 characters, including spaces.

Return only the compression text, with no heading, commentary, or explanation.

DOCUMENT TITLE:
[document title]

DOCUMENT:
[full document text]
```

Keep the canonical v2 prompt in one repository-owned code/source location and reuse it from participant-owned and project-native UI rather than maintaining divergent copies.

The copy action is deliberately a convenience export, not a model call. It copies one ready-to-paste request containing:

1. the exact `compression-prompt-v2` instructions;
2. the current document title substituted for `[document title]`;
3. the current full document text substituted for `[full document text]`.

The copied title and text must be the document state represented by the current full-text revision shown in the view. Copying uses only the user's clipboard: Loom must not transmit document content to OpenAI, another model provider, analytics, or any third party as part of this action.

Because the clipboard payload contains classified document content, do not log it, persist a duplicate merely for copying, place it in URLs, or expose it to viewers lacking current full-content access. The existing document view's access decision remains authoritative.

The human remains responsible for pasting the request into an external LLM if desired, reviewing the result, and deciding whether to save it to Loom. Loom does not infer or fabricate the external model's identity.

## Manual workflow and document UI

The usable manual workflow is:

1. Open the document and identify its current full-text version.
2. In **Agent compression**, use the copy control to copy the ready-to-paste `compression-prompt-v2` request containing the current title and full text.
3. Paste that request into an external LLM if desired.
4. Review the returned compression and paste it into Loom.
5. Save it against the full-text revision actually used.
6. Show the selected compression, source version, current full-text version, freshness, timestamp, and available actor provenance together.

The compression field has a hard maximum of 2,000 characters, including spaces. This limit must be discoverable before submission, not merely enforced after the fact. Both participant-owned and project-native document views must:

- state the 2,000-character maximum visibly near the field; and
- show a live character counter in the form `N / 2,000` (or an equally clear localized equivalent) while editing.

The input-level/server-side 2,000-character enforcement remains authoritative even though the prompt asks the external model to obey the same limit.

For example: “Agent compression · Stale — based on document v7; document is now v9.” A current compression likewise makes the source/current relationship visible without requiring the user to inspect history.

Saving pasted compression text binds it to the document revision the user actually used. If the document changed between opening the page and committing the compression, do not silently bind the result to the newer revision. Detect the mismatch and report a conflict or preserve the explicitly submitted source revision according to the existing update architecture, while keeping freshness truthful and accompanying metadata mutation atomic where the save contract requires it.

Editing a stale compression and saving it from the current document view creates a new compression revision bound to the current full-text revision. Historical compression revisions are not edited in place.

A metadata-only document edit does not stale compression. Only a new full-content revision changes the source/current relationship.

## Prompt provenance

The saving participant is not automatically the authoring model. Do not invent model identity or generation provenance for pasted text.

A saved prompt version records the Loom generation recipe associated with the manual workflow; it does not prove which external model was used or that the clipboard payload was pasted unchanged. New manual saves after this workflow change should record `compression-prompt-v2` where the implementation currently records the canonical Loom prompt version. Existing v1 compression revisions retain v1 provenance.

Verified generator details can be added later.

## Compression history

Compression history is content-bearing history and remains inspectable to authorized humans. Restoration/reversion of an older compression is not required by this contract.

The document history UI may combine timelines, but it must let an authorized human distinguish compression revisions from content and metadata events and inspect historical compression text, source document version when known, timestamp, actor provenance when known, and prompt version when known.

Missing historical timestamps or actor provenance remain explicitly unknown; do not fabricate 1970 timestamps or authors.

Do not leak historical compression text through metadata-only views or lifecycle shells.

## Access, history, and deletion

Compression editing follows the document's existing edit authority; it grants no new ownership, membership, or agent write capability. Project archive and account/project deadlines remain authoritative at mutation time.

All compression text, including previous values in history/events, follows current content access rules. Metadata/history visibility alone does not authorize disclosure of semantic compression text. In particular, metadata-only human views of agents-only material must not leak compression through history.

Retraction or permission loss blocks future compression access through the affected project just as it blocks body access. It does not delete a still-owned participant source or its private history.

When the document is deleted, its compression text and content-bearing compression history must be deleted with it. Do not retain these in shells, manifests, metadata-event payloads, clipboard helpers, or hidden duplicate records merely to preserve provenance. Minimal non-content provenance follows existing lifecycle policy.

Project-owned copies remain independent. A copied document does not reuse a source document's version ID as the copy's own source revision or claim freshness without an explicit valid mapping.

## Agent API contract

Authorized discovery and document retrieval expose enough structured information to relate the selected compression to the full text: current full-text revision ID, compression revision ID, source revision ID, freshness, and permitted provenance/timestamps.

A caller can distinguish missing, stale, and unknown compression from current compression without inferring this from timestamps or prose. Return compression text only when current content access permits it. Compute the source/current relationship from a consistent read so concurrent updates cannot yield a falsely current result.

Preserve the existing nullable compression string for compatibility where required; structured alignment fields are additive rather than a silent JSON type replacement.

This contract does not itself authorize new GPT Action document-read or agent-write operations.

## Acceptance requirements

Use the operation/state model in [TESTING_MODEL.md](./TESTING_MODEL.md). Compression behavior must continue to cover:

- participant-owned and project-native **Agent compression** UI;
- current/stale/missing/legacy-unknown states;
- immutable compression revision history and truthful source binding;
- metadata-only edits not changing freshness;
- full-text edits making selected compression stale without deleting it;
- source revision validation and concurrency protection;
- permitted editors only, including archive/retraction/account/deletion restrictions;
- legacy migration without fabricated provenance/source/timestamps;
- authorized agent responses exposing alignment without widening disclosure;
- server-side/input enforcement of the 2,000-character maximum.

The v2 manual-workflow UI additionally requires tests or equivalent focused coverage proving:

- the canonical new-save prompt version is `compression-prompt-v2`;
- v1 remains unchanged as historical provenance;
- the v2 prompt explicitly says the compression must not exceed 2,000 characters including spaces;
- the copy action contains the exact canonical v2 instructions plus the current document title and current full document text;
- participant-owned and project-native copy behavior use the same canonical implementation;
- copying performs no network/model request and does not mutate the document;
- the UI visibly states the limit and updates a live `N / 2,000` character count;
- saving still enforces the 2,000-character limit independently of prompt compliance.

Automatic model calls, agent document writes, new GPT Action document reads, compression restoration, competing compression candidates, ranking/orchestration, and verified external-model provenance remain outside this contract.