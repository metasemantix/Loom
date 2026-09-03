# GPT Action integration path

This document captures a pragmatic compatibility path for using Loom from GPTs that can call predeclared Actions but cannot freely operate arbitrary browser forms or construct unconstrained HTTP requests.

It is not a replacement for Loom's generic agent-discovery model. It is a product-specific bridge around tool-actuation limits in some current agent environments.

## Why this exists

Loom already exposes generic discovery and machine-access surfaces such as `/agent`, `/llms.txt`, `/.well-known/loom-agent`, and the project-scoped machine API. An unfamiliar capable agent should eventually be able to discover and use these without Loom-specific hard-coding.

The existing `/agent` credential entrance is entirely client-side. The page keeps the entered token only in memory, clears the input, and immediately calls `GET /api/agent/me` with the token in the `Authorization: Bearer ...` header. There is no separate agent login endpoint or server-side agent session behind the field.

Some agent environments can discover that flow but cannot type into the form or dynamically attach the required authorization header. Discovery therefore succeeds while actuation fails.

GPT Actions provide a narrow compatibility path by supplying a predeclared callable operation.

## First experiment: credential handoff only

The first experiment should answer one question before Loom exposes any broader Action surface:

> Can a GPT Action transmit a Loom project credential supplied by the user in conversation and have Loom recognize the corresponding grant?

For this experiment the user may paste their own `loom_agent_...` credential into the GPT conversation. The GPT passes it once to a dedicated compatibility operation. Loom validates it through the same authoritative credential-validation path used by the canonical bearer API and returns the same safe caller/grant introspection data as `/api/agent/me`.

This is the semantic equivalent of entering the token into `/agent` and pressing Authenticate. It is not browser automation of that DOM field, a new login mechanism, or a new permission model.

The compatibility transport should accept the credential in request data, not in a URL or query string. The raw credential must not be echoed, logged, persisted, or converted into a GPT-specific server session. Responses handling the credential should not be cached.

The canonical machine API remains unchanged:

`GET /api/agent/me` with `Authorization: Bearer loom_agent_...`.

The compatibility route exists only because GPT Actions may not be able to construct that header dynamically from a credential supplied in conversation.

Do not bake a single Loom project token into a generally distributed GPT. A static shared credential would collapse user/project isolation and defeat Loom's revocable project-scoped grants.

## First OpenAPI surface

The first GPT Action schema should expose only one operation, conceptually `authenticateLoomCredential`, backed by a narrow endpoint such as `POST /api/gpt-action/authenticate`.

The request contains the conversation-supplied Loom credential. The successful response contains the safe caller/grant representation already produced by machine introspection. The implementation must reuse the existing machine credential validation and current lifecycle/revocation semantics rather than implementing authentication twice.

Serve the small OpenAPI document from a stable Loom route such as `/openapi/gpt-action.json` so it can be imported into a custom GPT.

The implemented compatibility route is `POST /api/gpt-action/authenticate`, with an `application/json` body containing only the conversation-supplied `credential`. Its credential-handling responses use `Cache-Control: no-store`. The importable OpenAPI 3.1 document is served at `GET /openapi/gpt-action.json`, identifies `https://loom.metasemantix.workers.dev` as its production server, and exposes only this operation under the stable operation ID `authenticateLoomCredential`.

Do not expose project metadata, document listing, document retrieval, check-in, or other writes in this first schema. Those are later slices, contingent on proving credential handoff first.

## Acceptance test for the first experiment

1. deploy the credential-handoff endpoint and one-operation OpenAPI schema;
2. configure a test custom GPT with that schema;
3. give the GPT a live Loom project credential in conversation;
4. ask it to use the credential with Loom;
5. verify that Loom returns the corresponding current grant;
6. revoke the credential;
7. verify that the same Action subsequently fails cleanly.

If the GPT cannot populate the credential request field, that failure is the result of this experiment and should be investigated before building the wider Action API.

## Later Action surface

Only after credential handoff works should the Action surface grow toward the existing machine-read operations:

- project metadata;
- project document listing/discovery;
- individual document retrieval.

These should continue to map to Loom's existing authorization logic and live corpus semantics documented in `AGENT_ACCESS.md`. GPT compatibility must not create a parallel permission model.

## Relationship to generic agent discovery

This path should not cause Loom to abandon or weaken `/agent`, `/llms.txt`, or `/.well-known/loom-agent`.

The distinction is:

- **discovery**: can an unfamiliar agent determine how Loom works?
- **actuation**: does that agent possess tools capable of actually presenting credentials and making the required calls?

GPT Actions primarily address the second problem by supplying predeclared callable operations. A future browser-capable/general HTTP agent should still be able to arrive cold and use Loom's generic discovery trail.

## Non-goals

The first slice does not provide:

- project or document read Actions;
- check-in or other mutation Actions;
- universal self-discovering API invocation;
- arbitrary HTTP tooling inside ChatGPT;
- shared/global GPT credentials;
- automatic credential minting;
- persistent GPT credentials or a Loom agent session;
- OAuth;
- a public marketplace Loom GPT;
- replacement of Loom's existing generic machine protocol.
