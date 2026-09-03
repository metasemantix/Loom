# Current Codex Task

Implement Loom's first GPT Action compatibility experiment: **conversation-supplied credential handoff and introspection only**.

Read and follow `AGENTS.md`. Read `docs/GPT_ACTION_INTEGRATION.md` and `docs/AGENT_ACCESS.md` before implementation. Inspect the current `/agent` page, `src/agent-access.ts`, routing, and relevant machine-access tests rather than reconstructing behavior from this task alone.

## Goal

Prove one thing: a GPT Action can transmit a `loom_agent_...` project credential supplied by the user in conversation and Loom can recognize the corresponding current grant.

The existing `/agent` page is the behavioral reference. Its credential field is client-side only: it keeps the token in memory, clears the field, and calls `GET /api/agent/me` with `Authorization: Bearer ...`. There is no agent login endpoint or server-side agent session.

Implement the server-side semantic equivalent for GPT Actions, not DOM/browser automation.

## Required implementation

Add one narrow compatibility endpoint, preferably:

`POST /api/gpt-action/authenticate`

with JSON input containing the Loom credential, e.g. `{ "credential": "loom_agent_..." }`.

It must:
- validate through the same authoritative machine-credential path used by the existing bearer API; refactor for reuse if necessary rather than duplicating authentication logic;
- return the same safe caller/grant information as successful `GET /api/agent/me` introspection;
- preserve current revocation, project lifecycle, capability, and audit semantics;
- never echo, persist, or log the raw credential;
- never put the credential in a URL/query string or create a GPT-specific cookie/session;
- use `no-store` caching behavior for credential-handling responses;
- reject unsupported methods and malformed, unknown, revoked, or otherwise unusable credentials cleanly.

Keep the canonical `GET /api/agent/me` bearer interface unchanged.

Add a small public OpenAPI JSON document at a stable route such as:

`GET /openapi/gpt-action.json`

For this slice it must expose **only** the credential-handoff operation with stable operation ID `authenticateLoomCredential`, including enough request/response schema for a GPT Action to supply the credential and understand the resulting grant.

## Tests and acceptance

Add focused coverage proving:
- valid active credential succeeds;
- returned grant matches canonical `/api/agent/me` semantics;
- malformed and syntactically valid-but-unknown credentials fail;
- revoked credentials fail;
- relevant unavailable project lifecycle states retain canonical behavior;
- raw credential is absent from responses and audit data;
- unsupported methods do not authenticate;
- the OpenAPI route returns valid JSON and exposes only this first Action operation.

Run the repository-required validation from `AGENTS.md`, including at minimum:

```text
npm test
npm run typecheck
git diff --check
```

Report pre-existing failures separately from regressions.

## Documentation

`docs/GPT_ACTION_INTEGRATION.md` is the durable design note for this experiment. Keep it aligned if implementation settles a detail differently, but do not broaden the architecture beyond this slice.

## Explicit non-goals

Do not implement project metadata Actions, document listing/retrieval Actions, check-in or other writes, OAuth, persistent GPT credentials, browser automation, a new agent session, a parallel permission model, telemetry as a dependency, or unrelated refactors.

The completion criterion is deliberately narrow: after deployment, we should be able to configure a custom GPT with the one-operation schema, paste a live Loom credential into its conversation, ask it to use Loom, and learn whether GPT Actions can successfully deliver that credential to Loom. Wider Action functionality comes only after that experiment succeeds.
