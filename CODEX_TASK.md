# Current Codex Task

Implement Loom's **Agent compression foundation**: make compression a first-class document UI concept, provide the canonical manual LLM generation prompt, and bind versioned compression revisions to the full-text revisions they describe.

Read and follow `AGENTS.md`. Read `docs/DOCUMENT_LIFECYCLE.md` in full before implementation; it is the durable normative contract for this slice. Also read the relevant access/lifecycle documents it references, especially `docs/AGENT_ACCESS.md`, `docs/CONTRIBUTION_LIFECYCLE.md`, `docs/PROJECT_NATIVE_DOCUMENTS.md`, `docs/PROJECT_LIFECYCLE.md`, and `docs/TESTING_MODEL.md`.

Inspect the current schema/migrations, participant-owned and project-native document APIs/UI, document version/history implementation, metadata-event behavior, deletion cleanup, and machine document responses before choosing the implementation shape. Do not reconstruct existing behavior from this task alone.

## Goal

Prevent compression from becoming an unversioned summary blob whose relationship to an evolving full document is unknowable.

After this slice:

- humans can clearly find and understand **Agent compression** in document UI;
- they can copy Loom's canonical `compression-prompt-v1` for use in an external LLM and paste the reviewed result back into Loom;
- each newly saved compression is an immutable compression revision bound to the specific full-text revision it describes;
- Loom can truthfully report compression freshness as `missing`, `current`, `stale`, or legacy `unknown`;
- previous compression revisions remain inspectable under content-access rules;
- existing compression data survives migration without fabricated provenance or source-version claims.

This is a data/lifecycle foundation, not automatic AI generation.

## Required implementation

### 1. Persistence and migration

Introduce the minimum schema needed for immutable compression revisions and a selected/current compression per document. Each new compression revision must have its own ID, document ID, text, source full-text version ID, creation timestamp, saving actor provenance using existing provenance conventions, and generation-prompt version when known.

Keep document and compression revision numbering/identity independent. The authoritative relationship is the compression revision's source full-text revision ID.

Migrate existing non-null `documents.compression` values without losing text. They must become legacy compression data with unknown source-version relationship and without invented original author/model/timestamp. Preserve migration provenance separately where appropriate. Do not silently assert that legacy text describes the current document version.

Keep compatibility with existing callers deliberately. Do not silently change an existing JSON field from a string/null into an incompatible object. Remove or retain the old storage column only according to a safe migration/compatibility plan; do not leave two independently mutable sources of truth.

Ensure document deletion removes content-bearing compression history according to the lifecycle contract.

### 2. Freshness contract

Derive selected compression status exactly as defined in `docs/DOCUMENT_LIFECYCLE.md`:

- `missing`: no selected compression;
- `current`: source version equals current full-text version;
- `stale`: source version is an older revision of this document;
- `unknown`: preserved legacy compression has no established source revision.

A full-content revision makes an existing bound compression stale without deleting or rebinding it. Metadata-only changes do not affect freshness.

Validate source-version ownership: a source revision must belong to the same document. Reject nonexistent or foreign-document source revisions.

Avoid races that can falsely label a compression current. Saving from a page representing the current revision must not silently bind an externally generated compression to a newer revision that appeared while the user was working. Use the repository's existing concurrency/update conventions where possible and return a conflict or otherwise preserve the explicitly submitted source revision truthfully.

Editing/saving a stale compression from the current document view creates a new compression revision bound to the current full-text revision. Never mutate historical compression text in place.

### 3. Document UI

Update both participant-owned and project-native document views where compression editing currently exists.

Create a clearly named **Agent compression** section instead of leaving the field anonymous inside Document details.

The section must include:

- concise explanatory help/tooltip: compression is a compact semantic representation agents can use to judge relevance before retrieving full content;
- a copy control for the canonical repository-owned `compression-prompt-v1` defined in `docs/DOCUMENT_LIFECYCLE.md`;
- the editable compression field, retaining the current 2,000-character limit;
- visible freshness and version relationship, e.g. current based on document v7, or stale based on v7 while current full text is v9;
- timestamp and available actor provenance for the selected compression where appropriate.

Keep the canonical prompt in one code/source location and reuse it rather than duplicating prompt text across UI implementations. Copying the prompt must not send document content anywhere. This slice performs no model/API call.

Saving pasted compression text must bind it to the document revision the user actually used, following the concurrency rule above.

### 4. Compression history

Make compression revisions inspectable now. Reuse/extend the existing document history UI if sensible rather than creating an unnecessary separate history product.

Authorized viewers must be able to distinguish compression revisions from full-content and metadata events and inspect historical compression text plus source document version when known, timestamp, actor provenance when known, and prompt version when known.

Restoring/reverting an old compression is not required.

Historical compression is classified/content-bearing data. Do not expose it through metadata-only views, project shells, or any path that would not currently authorize full semantic content.

### 5. API / machine representation

Additively expose enough information in existing authorized document/machine responses to relate the selected compression to the full text: current full-text revision identity, selected compression revision identity, source revision identity when known, freshness, and permitted timestamps/provenance.

Preserve the existing compression string/null field where compatibility requires it; add structured fields rather than changing its type incompatibly.

Do not add new GPT Action document-read operations in this slice.

## Tests and acceptance

Implement focused unit/integration/acceptance coverage for the acceptance requirements in `docs/DOCUMENT_LIFECYCLE.md`, including at minimum:

- migration of documents with and without existing compression;
- no lost legacy text and no fabricated legacy source binding/provenance;
- current -> stale transition after full-content edit;
- metadata-only edit does not stale compression;
- stale compression edit/save creates a new current compression revision while preserving history;
- missing/current/stale/unknown remain distinguishable;
- foreign/nonexistent source version rejected;
- concurrent content update cannot produce a falsely current compression;
- participant-owned and project-native edit authority and lifecycle restrictions remain correct;
- deletion/retraction/access behavior does not leak historical compression;
- both document UIs expose Agent compression, the canonical copyable prompt, and truthful version/freshness state;
- copied prompt matches `compression-prompt-v1` exactly;
- 2,000-character limit remains enforced;
- authorized agent/document responses expose alignment additively without widening access.

Run the repository-required validation from `AGENTS.md`, including at minimum:

```text
npm test
npm run typecheck
git diff --check
```

If the environment again cannot execute Vitest or install dependencies because of registry/403 restrictions, do not modify dependency configuration merely to work around the runner. Report the exact blocked checks and any narrower validation that could be completed. Distinguish environment failures from implementation failures.

## Documentation

`docs/DOCUMENT_LIFECYCLE.md` is the durable source of truth for compression revision semantics and the canonical manual-generation prompt. Keep it aligned if implementation forces a concrete field/endpoint detail to be settled.

Update implementation/status documentation as appropriate after implementation. Do not duplicate the durable lifecycle contract into another design document.

## Explicit non-goals

Do not implement:

- automatic or Loom-hosted LLM compression generation;
- sending document content to an external model;
- GPT Action project/document reads;
- agent document/compression writes;
- compression restoration/revert UI;
- multiple competing selected compression candidates or ranking;
- a general derived-artifact framework;
- verified external model identity/provenance;
- unrelated permission, lifecycle, authentication, or UI redesigns.

Implement this slice completely and narrowly. The intended next architectural benefit is that future agents can use a small, explicitly version-aligned compression to decide whether expensive full-document retrieval is necessary, rather than recreating giant-document retrieval by default.
