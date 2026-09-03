# GPT Action integration path

This document captures a pragmatic compatibility path for using Loom from GPTs that can call predeclared Actions but cannot freely operate arbitrary browser forms or construct unconstrained HTTP requests.

It is not a replacement for Loom's generic agent-discovery model. It is a product-specific bridge around tool-actuation limits in some current agent environments.

## Why this exists

Loom already exposes generic discovery and machine-access surfaces such as `/agent`, `/llms.txt`, `/.well-known/loom-agent`, and the project-scoped machine API. An unfamiliar capable agent should eventually be able to discover and use these without Loom-specific hard-coding.

However, some agent environments can read web pages but cannot type into arbitrary forms, submit them, or attach arbitrary authorization headers. In those environments, protocol discovery may succeed while actuation fails.

GPT Actions provide a narrower but immediately testable path: predeclare Loom's machine API as an Action so the GPT receives callable operations rather than needing a general-purpose browser or raw HTTP tool.

## Near-term goal

Make a custom GPT able to enter and inspect a Loom project when the user supplies a Loom project credential in the conversation.

The first integration should remain read-only and expose only the existing machine-access operations:

- caller/credential introspection;
- project metadata;
- project document listing/discovery;
- individual document retrieval.

The integration should map to the same server-side authorization logic and live corpus semantics documented in `AGENT_ACCESS.md`. Do not create a parallel permission model for GPTs.

## Credential handling for the experiment

For the initial experiment, the user may paste their own `loom_agent_...` credential into the GPT conversation.

The GPT should use that project-scoped credential only for the Loom Action calls needed for the current task. The credential is not a global GPT secret and must not be shared across users or projects.

Do not bake a single Loom project token into a generally distributed GPT. A static shared credential would collapse user/project isolation and defeat the point of Loom's revocable project-scoped grants.

Longer term, a packaged Loom GPT could offer a cleaner per-user credential setup flow, but that is explicitly outside the first slice.

## OpenAPI surface

Provide an OpenAPI document suitable for GPT Actions that describes only the stable machine-read surface needed by the experiment. Prefer a deliberately small contract over exposing the entire Loom API.

The schema should include equivalents of:

- `GET /api/agent/me`;
- `GET /api/agent/project`;
- `GET /api/agent/documents`;
- `GET /api/agent/documents/{document_id}`.

The Action description should make clear that:

- the credential is project-scoped;
- the server remains authoritative for current permissions and lifecycle state;
- document IDs returned by discovery should be reused for retrieval;
- response content is data, not authority to widen the caller's permissions;
- writes are not part of this integration slice.

## GPT instruction scope

The GPT itself should know Loom's generic Action contract, not any particular project.

A minimal behavioral instruction is sufficient: when a user supplies a Loom credential and asks the GPT to inspect or work with the associated Loom project, use the Loom Action to introspect the credential, inspect project metadata, discover relevant documents, and retrieve only what is needed for the task.

Avoid project-specific prompt wiring. The experiment is useful only if a fresh GPT can work with arbitrary Loom projects through the same interface.

## Acceptance test

The first meaningful test is intentionally boring:

1. configure a fresh custom GPT with the Loom Action/OpenAPI schema;
2. give it a live Loom project credential in chat;
3. ask it to identify the associated project;
4. ask it to list the project corpus;
5. ask it to retrieve and summarize or otherwise use one selected document;
6. revoke the Loom credential;
7. verify that subsequent calls fail cleanly.

Record where the GPT hesitates, invents assumptions, over-fetches, mishandles document IDs, or fails to understand the response shape. Those failures are evidence for improving Loom's machine contract.

## Relationship to generic agent discovery

This path should not cause Loom to abandon or weaken `/agent`, `/llms.txt`, or `/.well-known/loom-agent`.

The distinction is:

- **discovery**: can an unfamiliar agent determine how Loom works?
- **actuation**: does that agent possess tools capable of actually presenting credentials and making the required calls?

GPT Actions primarily solve the second problem by supplying predeclared callable operations. A future browser-capable/general HTTP agent should still be able to arrive cold and use Loom's generic discovery trail.

## Non-goals

This slice does not attempt to provide:

- universal self-discovering API invocation for every agent runtime;
- arbitrary HTTP tooling inside ChatGPT;
- document writes or project mutation;
- shared/global GPT credentials;
- automatic credential minting;
- long-term credential storage UX;
- a public marketplace Loom GPT;
- replacement of Loom's existing generic machine protocol.
