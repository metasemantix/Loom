# Loom Compression v3

This document defines Loom's durable compression architecture from v3 onward. Where this document conflicts with the older prose-only manual compression contract in `DOCUMENT_LIFECYCLE.md`, this document is authoritative. Existing v1/v2 prompt provenance and historical compression revisions remain valid historical records.

## Purpose and boundary

Loom compression is a pre-reading semantic routing layer. Its job is to let an authorized agent determine what a document contains and whether fetching the full document is worthwhile.

Compression is not post-reading cognition. It must describe what the source contains without introducing corpus-level synthesis, mechanism extraction, judgments, reusable patterns, or other conclusions an agent derives after reading. Those belong downstream in THREAD or another derived-knowledge layer.

The protected boundary is:

> Compression describes what the source contains. Derived cognition describes what an agent makes of it.

Conceptual pipeline:

```text
public / technical metadata
        ↓
structured compression
"what is in this document?"
        ↓
full document
"read the actual source"
        ↓
agent reasoning
        ↓
derived concepts / mechanisms / syntheses / patterns
        ↓
THREAD or another derived-knowledge layer
```

Compression is therefore best understood as a lossy semantic index/projection of one source revision, not merely shorter document text.

## Canonical artifact

From v3 onward, the canonical compression artifact is structured JSON. A compact natural-language `gist` remains mandatory because prose is useful for embeddings, semantic matching, and fast human inspection, but important distinctions should not require a consumer to reconstruct structure from prose.

The universal envelope is intentionally small:

```json
{
  "schema_version": 1,
  "source_revision": "...",
  "document_kind": "...",
  "gist": "...",
  "topics": ["..."],
  "contents": {}
}
```

Semantics:

- `schema_version`: version of the compression JSON contract, independent of document revision numbers and compression revision numbers.
- `source_revision`: authoritative ID of the full-text source revision described by this projection. Human-readable document version numbers remain display data only.
- `document_kind`: discriminator selecting the semantic shape of `contents`.
- `gist`: compact factual prose for retrieval and triage.
- `topics`: compact retrieval-oriented topic labels grounded in the source.
- `contents`: document-kind-specific structured payload.

Do not add a universal grab-bag of `decisions`, `constraints`, `open_questions`, `key_points`, or similar fields to the top-level envelope. Those concepts are useful for some document kinds and wrong for others.

## Document-sensitive payloads

Compression schemas are document-sensitive. The stable contract is the envelope plus the semantics of each recognized `document_kind`; `contents` is not one universal semantic ontology.

Initial v3 kinds:

### `design_spec`

For coherent design, architecture, protocol, requirements, or specification documents.

Typical `contents` fields may include:

```json
{
  "decisions": [],
  "constraints": [],
  "open_questions": [],
  "key_points": []
}
```

Each entry should be compact, source-grounded, and independently useful for triage.

### `idea_collection`

For scrapbooks, notebooks, brainstorm collections, or documents containing many relatively independent ideas.

The payload must preserve independently discoverable items rather than collapsing the document into one generic summary:

```json
{
  "items": [
    {
      "name": "...",
      "kind": "...",
      "gist": "...",
      "topics": ["..."]
    }
  ]
}
```

The Loom Scrapbook is the canonical stress case. Concepts such as Prompt Bleach, Canary Comments, Impossible Button, Dead Drop, Airlock, Agent Graffiti, LLM Quarantine, Human Please, Pudding Nail, and similar independent entries must remain individually discoverable when present in the source. An agent interested in agent-to-agent communication should be able to discover the relevant items without fetching the full Scrapbook; an agent interested in hostile-input handling should likewise be able to discover its relevant items.

### `meeting`

For meeting notes or minutes.

Typical payload:

```json
{
  "decisions": [],
  "actions": [],
  "unresolved_matters": []
}
```

### `incident_report`

For investigations, incident timelines, postmortems, or forensic reports.

Typical payload:

```json
{
  "events": [],
  "observations": [],
  "interpretations": [],
  "unresolved_matters": []
}
```

Where the source itself distinguishes observation from interpretation, preserve that distinction. Compression must not upgrade an investigator interpretation into an observed fact or introduce Loom's own inference.

### `reference`

For reference material whose primary utility is locating entities, facts, and caveats.

Typical payload:

```json
{
  "entities": [],
  "facts": [],
  "caveats": []
}
```

### `general`

Fallback for documents that do not fit a more specific kind without distortion.

Use a restrained payload rather than forcing a false taxonomy. `general` exists to avoid inventing The One Compression Ontology™ prematurely.

## Source grounding and addressability

Every compression revision describes exactly one full-text document revision. The source revision binding from `DOCUMENT_LIFECYCLE.md` remains mandatory and authoritative.

A desirable v3+ property is source addressability: individual compressed claims/items should eventually be able to retain anchors into the exact source passage or passages that produced them. This enables an "Epistemic Git Blame" operation: select a compressed item and inspect which source material supports it.

The initial v3 implementation does not need to solve robust anchoring or partial regeneration, but it must not choose a storage/API shape that makes per-item source anchors impossible to add later. Future anchor fields should be additive and source-revision-relative.

Open questions intentionally deferred:

- exact source-anchor representation;
- partial staleness when only some source passages change;
- automatic mapping of anchors across revisions.

## Freshness and versioning

Compression remains immutable, versioned derived content. Saving a replacement creates a new compression revision; historical revisions remain inspectable subject to access and lifecycle rules.

Freshness remains a relationship between the selected compression's `source_revision` and the document's current full-text revision:

- `missing`: no selected compression;
- `current`: source revision equals current full-text revision;
- `stale`: source revision refers to an older full-text revision;
- `unknown`: preserved legacy compression has no established source revision.

A source edit does not silently regenerate, delete, or relabel the old compression. Stale compression remains stale and explicit.

The JSON `schema_version` is separate from Loom's immutable generation-prompt version and from the compression revision's own history number.

Historical prose compressions and `compression-prompt-v1` / `compression-prompt-v2` provenance must not be rewritten merely because v3 becomes canonical.

## Manual generation v3

Until Loom performs native model calls, manual external-LLM generation remains a supported workflow. The repository owns one canonical v3 generation prompt and both participant-owned and project-native document UI must reuse it.

The v3 prompt must instruct the model to:

- return valid JSON only;
- use the canonical envelope;
- classify the document into the best available `document_kind` without forcing an ill-fitting kind;
- keep `gist` compact and retrieval-oriented;
- preserve source-grounded topics and important distinctions;
- use the kind-specific payload rather than a universal semantic payload;
- preserve independently meaningful items independently in `idea_collection` documents;
- add no information or interpretation not present in the source;
- avoid downstream synthesis, judgment, cross-document reasoning, or reusable knowledge extraction;
- bind the projection to the supplied source revision ID;
- stay within the existing storage/validation limit unless and until that limit is explicitly revised by a later contract.

The copy action remains clipboard-only convenience. It may include the current document title, source revision ID, and full document text in the ready-to-paste request. Loom must not transmit this payload to a model/provider merely because the user clicked Copy.

The returned JSON is human-reviewable before save. Loom must validate syntax and the required envelope before accepting a v3 compression revision; it must not silently coerce malformed external output into a different semantic artifact.

## Human-facing rendering

Canonical storage is structured JSON. The UI may render a compact human-readable view from that JSON rather than forcing users to edit raw JSON for routine inspection.

For the initial v3 slice, raw editable JSON is acceptable if that substantially reduces implementation scope, provided:

- the canonical stored value remains structured JSON rather than rendered prose;
- validation errors are clear;
- users can still inspect and edit the full artifact;
- machine responses return the structured artifact without requiring consumers to parse prose.

A richer form editor or document-kind-specific human editing UI is later work.

## Compatibility

Existing prose compression history must remain readable. Do not rewrite historical values into fabricated v3 JSON.

API compatibility fields that expose a nullable prose compression string may remain temporarily where required. New structured fields are additive until a deliberate compatibility migration removes old fields.

Consumers must be able to distinguish legacy prose compression from v3 structured compression explicitly; never guess based only on whether a string happens to parse as JSON.

## Access and deletion

Structured compression is classified content exactly like previous compression text. It follows the full document's current content access rules and must not leak through metadata-only views, shells, logs, URLs, analytics, or history surfaces that lack content authorization.

Deletion semantics remain unchanged: deleting the document destroys its compression artifacts and content-bearing compression history according to the existing lifecycle contract.

## v3 implementation boundary

The first implementation slice should establish the canonical structured artifact and manual workflow without trying to finish every future consequence.

In scope:

- canonical v3 JSON envelope;
- initial document-kind discriminator and payload validation;
- canonical v3 copy prompt including title, full content, and source revision ID;
- save-time JSON/schema validation;
- immutable revision/history/source binding using existing lifecycle infrastructure;
- participant-owned and project-native UI parity;
- machine/API representation that exposes structured v3 compression while preserving required compatibility;
- tests using both a coherent design/spec fixture and an `idea_collection` Scrapbook-style fixture.

Explicitly not required in this slice:

- Loom-hosted model generation;
- automatic document-kind detection by Loom outside the external generation prompt;
- source passage anchors;
- partial staleness;
- anchor remapping across source revisions;
- cross-document synthesis;
- THREAD implementation;
- ranking or orchestration among competing compressions;
- a comprehensive document-kind ontology;
- a rich document-kind-specific form editor.

## Acceptance principles

A v3 implementation is acceptable only if:

1. an authorized agent can determine what a document contains and whether full retrieval is worthwhile from the structured compression;
2. the same schema can naturally represent both a coherent design/spec and a heterogeneous idea collection without collapsing the latter into generic prose;
3. source revision provenance remains explicit and freshness remains truthful;
4. historical v1/v2 prose compression remains intact;
5. compression contains source-grounded description, not newly derived cognition;
6. the storage/API design leaves room for additive per-item source anchors later;
7. participant-owned and project-native documents behave consistently under the same canonical contract.
