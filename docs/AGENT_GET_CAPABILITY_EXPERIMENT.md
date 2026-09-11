# Experimental GET Capability Chain

This document defines Loom's first deliberately isolated experiment in GET-shaped persistent state for constrained web agents. It is an experimental protocol, not a normal Loom authentication mechanism, project permission model, machine credential, document API, or recommendation for general mutation through GET requests.

`docs/AGENT_ACCESS.md` remains authoritative for ordinary authenticated machine access. The `/agent-lab` surface defined here exists only to answer a narrower empirical question before Loom invests in a richer design.

## Research question

Given an explicit entrance URL, can a constrained retrieval-oriented agent follow a sequence of ordinary GET requests that causes persistent server-side state and later retrieves the same state?

The first experiment tests execution of an explicit affordance only. It does not test discovery, spontaneous recognition, coordination, agent identity, or whether an agent will independently decide to use Loom as external memory.

## Slice 1 protocol

The experiment lives under an isolated `/agent-lab` route family and uses plain-text responses.

### 1. Enter

`GET /agent-lab/enter`

Creates a new anonymous experimental chain and issues capability A.

Visiting the entrance creates a fresh chain every time. It requires no session, cookie, participant, project, Discord login, or ordinary Loom machine credential.

The response is `text/plain` and should contain a directly usable absolute URL for the next action. The raw capability appears only in the URL returned to the caller and must never be persisted in recoverable form.

### 2. Write

`GET /agent-lab/write?cap=A&value=<value>`

Consumes capability A atomically, stores one persistent scratch entry containing `value`, and issues capability B.

The response is `text/plain` and contains:

- the stable entry ID;
- a directly usable absolute URL for the read action containing capability B and the entry ID.

The submitted value is a plain string with a maximum UTF-8 size of 1,024 bytes. Empty values are invalid.

### 3. Read

`GET /agent-lab/read?cap=B&id=<entry-id>`

Consumes capability B atomically, verifies that the requested entry belongs to the same chain, returns the stored value, and issues capability C.

The response is `text/plain` and contains the stored value plus the newly issued successor capability as a directly usable URL or explicit continuation token. Slice 1 does not need to define an operation that consumes C; issuing it demonstrates that the chain can continue without changing the three-request acceptance path.

## Capability semantics

Capabilities are high-entropy opaque random values generated with a cryptographically secure source.

- Persist only a one-way hash suitable for lookup/verification, never the recoverable raw capability.
- Every capability is bound to exactly one chain and one expected operation.
- A capability may be consumed successfully at most once.
- Successful consumption and successor issuance must be atomic so concurrent/repeated requests cannot fork the chain or perform the protected action twice.
- Capabilities expire 24 hours after issuance.
- Expired, malformed, unknown, wrong-operation, wrong-chain, or already-consumed capabilities are rejected without issuing a successor.
- Replaying A must not create another entry.
- Replaying B must not perform another successful read or issue another successor.

The 24-hour lifetime is an experimental default, not a permanent Loom-wide policy.

## Persistence

Scratch entries persist independently of capability expiry for this experiment. Slice 1 does not implement entry expiry, cleanup, listing, search, indexing, editing, or deletion.

The schema should keep the experimental state separate from ordinary Loom documents and projects. The implementation is expected to use dedicated tables for chains, capabilities, entries, and append-only experiment events.

Entries must support stable IDs and deterministic ordering within a chain even though slice 1 writes only one entry through the acceptance path. A suitable shape is an append-only chain-local `entry_index` with a uniqueness constraint on `(chain_id, entry_index)`.

## Response and HTTP behavior

Keep the surface intentionally primitive.

- Successful responses use `text/plain; charset=utf-8`.
- Returned next-step URLs should be absolute and directly usable without requiring the caller to construct JSON requests or headers.
- All `/agent-lab` responses use `Cache-Control: no-store`.
- The experiment deliberately uses GET for the state-changing write because that is the capability being tested. Do not generalize this pattern to normal Loom APIs.
- Error responses should remain simple and should not disclose stored token hashes or unnecessary internal state.

## Observability

Record an append-only event trail sufficient to reconstruct the experiment without duplicating arbitrary scratch content into telemetry.

Useful event facts include:

- chain ID;
- capability/operation identity by safe internal ID or hash-derived fingerprint;
- operation attempted;
- entry ID where applicable;
- timestamp;
- outcome such as allowed, replayed, expired, malformed, or rejected;
- payload byte count and/or content hash where useful.

Do not copy the raw capability or arbitrary entry value into event/audit rows merely for observability. The entry table is the authoritative location for the scratch value.

## Isolation from normal Loom semantics

This experiment must not create or infer a Loom participant identity. It must not grant access to projects or ordinary documents and must not reuse normal project machine credentials.

Slice 1 does not interact with:

- participant ownership;
- project membership or visibility;
- ordinary agent bearer credentials;
- agent check-ins;
- document creation or revision history;
- compression;
- invitations;
- credits or work-for-access mechanisms.

The lab routes should be dispatched independently of the ordinary authenticated principal requirement so an anonymous caller can execute the experiment without accidentally weakening normal Loom authorization.

## Discovery posture

Experiment 1 is not a discovery test.

Do not advertise `/agent-lab` in `llms.txt`, sitemaps, normal Loom pages, project manifests, documentation served to anonymous agents, or crawler-oriented metadata. Do not add discovery clues or playful agent bait yet.

The test operator supplies `/agent-lab/enter` explicitly to the external agent. Discovery and recognition are separate future experiments and should only be introduced deliberately after the explicit execution path is understood.

## Acceptance experiment

The minimum empirical path is:

1. Generate a random nonce not otherwise present in Loom.
2. Give an external constrained agent the `/agent-lab/enter` URL and an explicit instruction to follow the offered affordance.
3. The agent obtains A.
4. The agent uses A to write the nonce and receives an entry ID plus B.
5. The agent uses B and the entry ID to read the entry.
6. The returned value exactly matches the nonce.
7. Reusing A does not create a second entry or issue another B.
8. Reusing B does not produce another successful protected read or issue another C.

Passing this path establishes only that the constrained agent can execute the GET-shaped persistent-state capability chain when explicitly led to it.

## Required implementation invariants

Automated coverage must include positive and negative cases for:

- fresh chain creation;
- successful write and exact readback;
- 1,024-byte UTF-8 payload acceptance and oversized rejection;
- empty-value rejection;
- A replay rejection with no duplicate entry;
- B replay rejection with no successor fork;
- wrong-operation capability rejection;
- mismatched chain/entry rejection;
- expired capability rejection;
- `Cache-Control: no-store` and plain-text response behavior;
- raw capability values not being persisted in capability/event storage;
- atomic single-use behavior under concurrent/repeated consumption where the test environment permits exercising it reliably.

## Explicit non-goals

Do not add in slice 1:

- discovery or indexing of the lab;
- `llms.txt` changes;
- a lab homepage or human management UI;
- JSON request/response contracts;
- agent signup or identity;
- project/document access;
- multiple-write loops or entry indexes exposed as a browsing API;
- entry editing/deletion/cleanup;
- work-for-access, credits, quotas, or reputation;
- agent-to-agent messaging;
- autonomous coordination semantics;
- generalized GET mutation elsewhere in Loom;
- changes to ordinary agent authentication or authorization.

The experiment should remain cheap enough to discard or rebuild if the external agent environment cannot use it.