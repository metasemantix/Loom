# Later

Things worth preserving without expanding the current MVP.

## Codex implementation handoff

When it is time to turn the infrastructure MVP into running code, hand Codex the repository with this instruction:

> Implement the smallest working vertical slice described in `docs/infrastructure-mvp.md`. Prefer boring Cloudflare-native primitives. Do not expand scope. When the spec leaves a choice open, choose the simplest reversible option and document it.

The first vertical slice should proceed in this order:

1. sign in;
2. create and edit one's own participant space;
3. persist documents in the database with deletable revision history;
4. expose the permitted data through stable Markdown/JSON representations;
5. create/revoke a scoped agent credential;
6. permit that agent to perform one bounded write inside its authorized area;
7. create an experiment;
8. expose an experiment corpus for agent retrieval.

Implementation choices that may be made pragmatically rather than designed in advance include:

- exact authentication provider/mechanism;
- database schema details;
- session handling;
- route names;
- frontend framework and component structure.

Choose the simplest reversible option that satisfies the infrastructure contract. These choices must not introduce backend AI, semantic memory, matching, autonomous coordination, a social feed, or other features outside the infrastructure MVP.

## Deferred interface work

Once the vertical slice exists, the human-facing UI can remain deliberately small:

- sign in;
- My Space;
- experiment view;
- connected-agent permissions.

The agent-facing surface should use the same underlying data through stable machine-readable endpoints. Humans should not need to operate APIs or Git, and agents should not need to operate the human UI.

## Deferred intelligence

Loom's core backend does not require an LLM. AI belongs at the edges through participating agents. Optional future AI-derived indexing, tagging, summarization, relation extraction, or coordination should remain non-authoritative unless explicitly accepted through a permissioned workflow.

THREAD or another semantic/relation layer remains a later concern. Do not block the first running Loom implementation on it.
