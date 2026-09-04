# Current Codex Task

Implement **Loom Compression v3: structured, document-sensitive semantic projections**.

Read and follow `AGENTS.md`. Read `docs/COMPRESSION.md` in full; it is the durable v3 architecture and is authoritative where it supersedes the prose-only compression portions of `docs/DOCUMENT_LIFECYCLE.md`. Also read the relevant compression lifecycle, agent-access, project-native-document, and testing contracts before implementation.

This task supersedes the pending v2 manual-workflow implementation. PR #31 has not been merged. Preserve useful v2 work (ready-to-paste copy behavior, visible limit/counter, historical v1/v2 provenance semantics) where compatible, but do not implement v3 as another prose-only compression layer.

## Goal

Change the canonical compression artifact for new compression revisions from plain prose to a structured, versioned JSON semantic projection of a specific full-text document revision, while preserving Loom compression's deliberately narrow purpose: cheap pre-reading retrieval and relevance triage.

Compression must describe what the source contains. It must not become a store for post-reading synthesis, judgment, cross-document reasoning, mechanisms, reusable patterns, or other derived cognition.

## Current relevant behavior

The existing compression foundation already provides immutable compression revisions, selected compression, source-version binding, current/stale/unknown/missing freshness, history, actor provenance, access/lifecycle restrictions, legacy migration behavior, and compatibility fields.

The pending unmerged PR #31 implements the v2 manual-workflow improvements: canonical `compression-prompt-v2`, a ready-to-paste clipboard request containing title/body, and visible 2,000-character guidance/counter. Treat that work as an implementation input, not as the final architecture.

## Required implementation

### 1. Canonical structured v3 artifact

Implement the v3 envelope defined in `docs/COMPRESSION.md`:

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

Canonical new v3 compression storage must preserve this structure rather than flattening it into rendered prose.

Validate at save time at minimum:

- valid JSON/object shape;
- supported `schema_version`;
- required envelope fields and their types;
- `source_revision` matches the explicitly submitted source revision and belongs to the same document;
- recognized `document_kind` or the documented fallback;
- payload shape appropriate to the selected kind;
- existing size/storage constraints, unless a migration is strictly required and documented.

Do not infer v3 merely because a legacy string happens to parse as JSON. Store or expose an explicit format/schema discriminator sufficient to distinguish historical prose compression from structured v3 compression.

### 2. Initial document kinds

Implement the bounded initial taxonomy from `docs/COMPRESSION.md`:

- `design_spec`;
- `idea_collection`;
- `meeting`;
- `incident_report`;
- `reference`;
- `general` fallback.

Do not invent a larger ontology in this slice.

Keep validation useful but restrained. The purpose is to preserve semantically important structure, not to reject harmless variation merely because every nested field was not anticipated.

For `idea_collection`, independently meaningful items must remain independently represented. Support item objects with at least `name`, `kind`, `gist`, and `topics`.

### 3. Canonical v3 manual-generation prompt

Add one repository-owned canonical `compression-prompt-v3` and reuse it from participant-owned and project-native UI.

The prompt must follow `docs/COMPRESSION.md` and request valid JSON only using the v3 envelope and document-sensitive payload. It must explicitly protect the compression/derived-cognition boundary and include:

- current document title;
- current full document text;
- authoritative current source revision ID;
- the supported initial document kinds and enough payload guidance to produce useful output;
- instruction not to force an ill-fitting kind;
- instruction to preserve independent `idea_collection` items independently;
- instruction not to add source-external inference or downstream synthesis;
- the currently authoritative size limit.

The clipboard action remains local convenience only: no model/API/network request, mutation, duplicate persistence, URL payload, analytics leakage, or access widening.

New manual v3 saves should record `compression-prompt-v3` where prompt provenance is recorded. Historical v1/v2 provenance remains unchanged.

### 4. Human editing/rendering

Provide a workable v3 human workflow in both participant-owned and project-native document views.

For this bounded slice, a raw JSON textarea is acceptable. It must:

- expose the complete canonical structured artifact;
- clearly identify v3 structured compression;
- report JSON/schema validation failures intelligibly;
- preserve the visible size guidance and live character counter from the v2 work where compatible;
- show existing freshness/source/provenance information;
- not render a lossy prose value back into canonical storage.

A richer form-based editor is explicitly later work.

### 5. Preserve lifecycle semantics

Preserve the existing compression revision architecture except where structured v3 representation requires additive changes:

- immutable history;
- source-version binding;
- current/stale/unknown/missing freshness;
- stale selected compression remains visible after full-text update;
- metadata-only edits do not stale compression;
- atomic conflict/concurrency behavior;
- actor provenance;
- access, retraction, archive, account, and deletion restrictions;
- legacy migration without fabricated provenance;
- deletion of content-bearing compression history with its document.

Do not rewrite historical prose compression into v3 JSON.

### 6. API / machine representation

Authorized machine responses must expose v3 compression as structured data without requiring an agent to parse a JSON string or rendered prose.

Preserve existing compatibility fields where required by the current API contract. Add explicit structured fields/discriminators rather than silently changing an existing string field's JSON type if that would break compatibility.

Continue to expose source/current alignment and freshness explicitly. Do not widen content authorization.

Design the representation so additive per-item source anchors can be introduced later without another fundamental artifact rewrite. Do not implement anchors in this slice.

## Required fixtures and tests

Use at least two semantically different fixtures:

1. a coherent design/spec document that naturally produces decisions/constraints/open questions/key points;
2. a Scrapbook-style `idea_collection` containing multiple independent named ideas, including examples spanning different retrieval interests (for example hostile-input handling and agent-to-agent communication).

Tests must prove at minimum:

- valid v3 envelope can be saved for participant-owned and project-native documents;
- malformed JSON and invalid required envelope fields are rejected clearly;
- invalid source revision binding is rejected;
- `design_spec` payload is accepted without requiring idea-collection structure;
- `idea_collection` preserves multiple independently discoverable items;
- a consumer can identify relevant individual idea items without fetching/parsing the full source document;
- canonical copy request includes v3 prompt, title, body, and source revision ID;
- both UI paths share the same canonical prompt implementation;
- new v3 manual saves record `compression-prompt-v3`;
- historical v1/v2 compression revisions remain unchanged and readable;
- legacy prose and structured v3 compression are explicitly distinguishable;
- machine/API responses expose structured v3 data plus truthful freshness/source alignment without widening access;
- full-text update makes selected v3 compression stale rather than rewriting it;
- metadata-only edit leaves it current;
- existing concurrency/lifecycle/deletion tests continue to pass;
- existing size validation and visible live counter remain enforced where applicable.

Run all repository-required checks from `AGENTS.md`, including at minimum:

```text
npm test
npm run typecheck
git diff --check
```

If the environment cannot run a required check because dependencies or registry access are unavailable, report the exact environmental block. Do not alter dependency/security configuration merely to make the runner green.

## Documentation

Keep `docs/COMPRESSION.md` as the durable v3 architecture. Amend it only if implementation exposes a genuine contract issue.

Update `docs/DOCUMENT_LIFECYCLE.md` narrowly where needed so it points to `docs/COMPRESSION.md` for the canonical v3 artifact/manual-generation contract and does not misleadingly describe v2 prose as the current canonical format. Preserve its useful lifecycle/history/access rules and historical v1/v2 prompt documentation.

Update agent-access documentation if the machine representation changes materially.

## Explicit non-goals

Do not implement:

- Loom-hosted or automatic model generation;
- automatic external transmission of document content;
- automatic Loom-side document-kind classification;
- source passage anchors or Epistemic Git Blame UI;
- partial staleness or anchor remapping across revisions;
- cross-document synthesis or knowledge-graph construction;
- THREAD or another derived-cognition layer;
- multiple compression candidates/ranking/orchestration;
- a comprehensive document-kind ontology;
- rich kind-specific form editors;
- unrelated authentication, permission, project-lifecycle, or UI redesigns.

Implement v3 completely within this boundary. Prefer additive migrations and compatibility-preserving API changes. Report any place where the existing 2,000-character storage limit materially conflicts with useful structured JSON rather than silently expanding scope.