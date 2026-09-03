# Current Codex Task

Implement the bounded **Agent compression manual-workflow v2** follow-up.

Read and follow `AGENTS.md`. Read `docs/DOCUMENT_LIFECYCLE.md` in full before implementation; it is the durable normative contract. Inspect the compression implementation already present in the repository before editing it, including the canonical prompt source, participant-owned and project-native document UI, compression save path/provenance, and existing tests.

## Goal

Make manual compression generation genuinely one-click and make Loom's 2,000-character compression limit impossible to miss.

After this slice, an authorized human can click the Agent compression copy control and receive a ready-to-paste external-LLM request containing Loom's canonical v2 instructions, the current document title, and the current full document text. The prompt itself tells the model about the 2,000-character maximum, and the compression editor visibly communicates and counts against the same limit.

## Current relevant behavior

The compression foundation introduced versioned compression revisions, freshness/source binding, history, actor provenance, and canonical `compression-prompt-v1`.

The current copy control copies only the prompt template and explicitly does not include document content. The compression textarea enforces a 2,000-character maximum but the limit is not sufficiently discoverable in the UI. New compression saves currently associate the canonical prompt version with the saved revision.

The durable contract has now advanced the manual workflow to `compression-prompt-v2`. Existing compression revisions carrying `compression-prompt-v1` are historical provenance and must not be rewritten.

## Required implementation

### 1. Canonical prompt v2

Update the repository-owned canonical prompt implementation for new manual generation to exactly match the `compression-prompt-v2` contract in `docs/DOCUMENT_LIFECYCLE.md`.

The prompt must explicitly include:

`The compression must not exceed 2,000 characters, including spaces.`

It must also contain the `DOCUMENT TITLE:` and `DOCUMENT:` envelope defined by the durable document.

Use `compression-prompt-v2` as the canonical prompt version for new saves after this change. Do not mutate or rewrite historical compression revisions that recorded `compression-prompt-v1`.

Keep one canonical prompt implementation reused by both participant-owned and project-native UI. Do not create divergent copies.

### 2. Ready-to-paste copy action

Change the Agent compression copy control in both participant-owned and project-native document views so it copies one ready-to-paste request containing:

- the exact canonical `compression-prompt-v2` instructions;
- the actual current document title in the `DOCUMENT TITLE:` section;
- the actual current full document text in the `DOCUMENT:` section.

The title and body must come from the current document state represented by the full-text revision in the view. Reuse the same helper/source for both UI variants where practical.

This is clipboard-only convenience. The copy action must not:

- make a model/API/network request;
- mutate the document;
- log or persist a duplicate clipboard payload;
- put document content in a URL;
- widen access to document content.

Update the copy control's label/help/success message as needed so it no longer falsely claims that no document content was copied. It should make clear that the prompt plus document content was copied to the user's clipboard.

Do not introduce a Loom-hosted LLM call.

### 3. Visible 2,000-character limit and live counter

In both participant-owned and project-native Agent compression editors:

- visibly state that the maximum is 2,000 characters, including spaces;
- retain the existing input/server-side enforcement;
- add a live character counter showing `N / 2,000` (or an equally clear localized equivalent);
- initialize the count correctly from an existing compression;
- update it immediately as the user edits the field.

Do not weaken server-side validation merely because the browser field has `maxlength`.

### 4. Preserve compression lifecycle semantics

Do not otherwise change the compression revision model introduced by the foundation slice.

In particular preserve:

- immutable compression history;
- source-version binding and current/stale/unknown/missing freshness semantics;
- stale compression remaining selected and visible after a full-text update;
- atomic conflict behavior for a compression save accompanied by metadata edits;
- actor provenance behavior;
- access/lifecycle restrictions;
- compatibility fields in machine/API responses.

A new save using the canonical manual workflow should record `compression-prompt-v2`; existing v1 history stays v1.

## Tests and acceptance

Add or update focused coverage proving at minimum:

- canonical new-save prompt version is `compression-prompt-v2`;
- the v2 prompt exactly matches the durable contract and contains the 2,000-character instruction;
- existing v1 compression provenance is not rewritten;
- copied participant-owned payload contains the canonical v2 instructions, current title, and current full body;
- copied project-native payload contains the same canonical v2 instructions, current title, and current full body;
- both UI paths share the canonical prompt implementation rather than duplicating prompt text;
- copy behavior performs no document mutation or model/network request;
- both editors visibly communicate the 2,000-character maximum;
- both editors expose a live counter initialized from existing text and updated on input;
- the existing 2,000-character save validation remains enforced;
- existing compression lifecycle/concurrency tests continue to pass.

Run the repository-required validation from `AGENTS.md`, including at minimum:

```text
npm test
npm run typecheck
git diff --check
```

If the environment again cannot execute Vitest or install dependencies because of registry/403 restrictions, do not modify dependency configuration merely to work around the runner. Report the exact blocked checks and any narrower validation that could be completed. Distinguish environment failures from implementation failures.

## Documentation

`docs/DOCUMENT_LIFECYCLE.md` has already been updated with the durable v2 contract. Keep implementation aligned with it. Do not create a second architectural document for this bounded follow-up.

Only amend durable documentation further if implementation reveals a real contract issue that must be settled; do not rewrite it merely to narrate code changes.

## Explicit non-goals

Do not implement:

- automatic or Loom-hosted LLM compression generation;
- automatic transmission of document content to an external model/provider;
- model selection or verified model provenance;
- GPT Action project/document reads;
- agent document/compression writes;
- compression restoration/revert UI;
- multiple competing compression candidates, ranking, or orchestration;
- unrelated permission, lifecycle, authentication, schema, or UI redesigns.

Implement this follow-up completely and narrowly.