# Experimental GET Capability Chain

This document defines Loom's deliberately isolated experiments in GET-shaped persistent state and constrained link-following for web agents. These are experimental protocols, not normal Loom authentication mechanisms, project permission models, machine credentials, document APIs, or recommendations for general mutation through GET requests.

`docs/AGENT_ACCESS.md` remains authoritative for ordinary authenticated machine access. The `/agent-lab` surface exists only to answer narrower empirical questions before Loom invests in richer designs.

## Research question

Given an explicit entrance URL, can a constrained retrieval-oriented agent follow a sequence of ordinary GET requests that causes persistent server-side state and later retrieves the same state?

Slice 1 tests execution of an explicit write/read affordance. It does not test discovery, spontaneous recognition, coordination, agent identity, or whether an agent will independently decide to use Loom as external memory.

## Slice 1 protocol

The experiment lives under an isolated `/agent-lab` route family and uses plain-text responses.

### 1. Enter

`GET /agent-lab/enter`

Creates a new anonymous experimental chain and issues capability A.

Visiting the entrance creates a fresh chain every time. It requires no session, cookie, participant, project, Discord login, or ordinary Loom machine credential.

The response is `text/plain` and contains a directly usable absolute URL for the next action. The raw capability appears only in the URL returned to the caller and must never be persisted in recoverable form.

### 2. Write

`GET /agent-lab/write?cap=A&value=<value>`

Consumes capability A atomically, stores one persistent scratch entry containing `value`, and issues capability B.

The response is `text/plain` and contains the stable entry ID and a directly usable absolute read URL containing capability B and the entry ID.

The submitted value is a plain string with a maximum UTF-8 size of 1,024 bytes. Empty values are invalid.

### 3. Read

`GET /agent-lab/read?cap=B&id=<entry-id>`

Consumes capability B atomically, verifies that the requested entry belongs to the same chain, returns the stored value, and issues capability C.

The response is `text/plain` and contains the stored value plus the newly issued successor capability. Slice 1 does not define an operation that consumes C.

## Observed constraint motivating Slice 2

Initial external testing established an important distinction between agent environments.

A ChatGPT Work run could execute the Slice 1 chain using an available shell HTTP client. An ordinary ChatGPT web-retrieval run could retrieve `/agent-lab/enter` and see the returned write URL, but reported that it could not follow a URL it had modified by appending an operator-supplied value to the returned `value=` parameter. This suggests a narrower empirical question before implementing compositional writing: can an ordinary retrieval agent recursively follow fresh URLs when every next URL appears verbatim in the immediately preceding response?

Do not infer the answer from the observed tooling message. Slice 2 exists to measure it directly.

## Slice 2: recursive verbatim-link hop probe

Slice 2 is a minimal prerequisite experiment for any future hyperlink-keyboard/compositional-writing design. It adds no scratch writing and no alphabet menu.

### Hop entrance

`GET /agent-lab/hop/enter`

Creates a fresh anonymous hop chain and returns exactly one directly usable absolute `next` URL containing a newly issued single-use hop capability.

Conceptually:

```text
next: https://<origin>/agent-lab/hop?cap=A
```

### Hop continuation

`GET /agent-lab/hop?cap=<capability>`

A valid hop capability is atomically consumed. For nonterminal hops, the server issues a fresh single-use successor capability and returns exactly one absolute `next` URL containing that successor.

The successor capability must not exist before its predecessor is successfully consumed. Therefore a successful multi-hop run demonstrates that the agent can use a newly retrieved response as the source of a previously unseen literal URL.

Use three capability-consuming hops after the entrance for the first probe:

```text
enter -> A -> B -> C -> terminal
```

A returns B, B returns C, and consuming C returns a terminal plain-text marker with no `next` URL:

```text
success: pebble-hop-complete
```

The hop responses must not require the caller to edit, interpolate, append to, or otherwise construct a URL. Every actionable URL must occur literally and completely in the immediately preceding response.

### Hop capability semantics

Reuse the security properties of Slice 1 rather than weakening them for convenience:

- cryptographically secure high-entropy opaque capabilities;
- raw capability never persisted recoverably;
- one-way hash persisted for lookup/verification;
- capability bound to its hop chain and expected hop operation;
- 24-hour expiry;
- successful consumption at most once;
- consumption and successor issuance atomic so replay/concurrency cannot fork the chain;
- malformed, unknown, expired, replayed, or wrong-operation capabilities rejected without a successor;
- successful and error responses remain `text/plain; charset=utf-8` and `Cache-Control: no-store`.

Record enough append-only experimental events to reconstruct entrance, successful hops, terminal completion, and rejection outcomes without storing raw capabilities.

Implementation may reuse the existing experimental chain/capability/event tables if doing so preserves their constraints cleanly, or add the smallest migration needed to represent hop operation/depth. Do not distort ordinary Loom schema or authorization to avoid an experimental migration.

### Slice 2 acceptance experiment

Give a fresh ordinary chat only the hop entrance URL and an instruction equivalent to:

> Visit the entrance. Follow the exact `next` URL returned to you. Continue following each exact `next` URL you receive until there is no `next` URL, then report the final response.

A pass requires reaching exactly `success: pebble-hop-complete` through the three newly generated successor URLs.

A failure at any hop is also a useful experimental result. Do not add redirects, alternate hosts, URL rewriting tricks, shell execution, or fallback transports to make the probe pass.

Passing Slice 2 establishes only recursive verbatim-link following. It does not establish arbitrary agent-authored state, compositional writing, discovery, or autonomous use.

## Capability semantics shared by the lab

Capabilities are high-entropy opaque random values generated with a cryptographically secure source.

- Persist only a one-way hash suitable for lookup/verification, never the recoverable raw capability.
- Every capability is bound to exactly one chain and one expected operation.
- A capability may be consumed successfully at most once.
- Successful consumption and successor issuance must be atomic so concurrent/repeated requests cannot fork the chain or perform the protected action twice.
- Capabilities expire 24 hours after issuance.
- Expired, malformed, unknown, wrong-operation, wrong-chain, or already-consumed capabilities are rejected without issuing a successor.

The 24-hour lifetime is an experimental default, not a permanent Loom-wide policy.

## Persistence

Slice 1 scratch entries persist independently of capability expiry. The lab does not implement entry expiry, cleanup, listing, search, indexing, editing, or deletion.

The schema keeps experimental state separate from ordinary Loom documents and projects. Raw capabilities are never persisted.

## Response and HTTP behavior

Keep the surface intentionally primitive.

- Successful responses use `text/plain; charset=utf-8`.
- Returned next-step URLs are absolute and directly usable without JSON, custom headers, cookies, or knowledge of Loom's internal API conventions.
- All `/agent-lab` responses use `Cache-Control: no-store`.
- The experiment deliberately uses GET for state-changing experimental operations. Do not generalize this pattern to normal Loom APIs.
- Error responses remain simple and do not disclose stored token hashes or unnecessary internal state.

## Observability

Record an append-only event trail sufficient to reconstruct the experiment without duplicating arbitrary scratch content into telemetry. Useful facts include chain ID, safe capability identity, operation, entry ID where applicable, timestamp, outcome, and payload metadata where useful.

Do not copy raw capabilities or arbitrary entry values into event/audit rows merely for observability.

## Isolation from normal Loom semantics

These experiments must not create or infer a Loom participant identity. They must not grant access to projects or ordinary documents and must not reuse normal project machine credentials.

The lab does not interact with participant ownership, project membership or visibility, ordinary agent bearer credentials, agent check-ins, document creation or revision history, compression, invitations, credits, or work-for-access mechanisms.

Lab routes are dispatched independently of the ordinary authenticated principal requirement, narrowly limited to explicit `/agent-lab` routes so normal Loom authorization remains unchanged.

## Discovery posture

These are not discovery tests.

Do not advertise `/agent-lab` in `llms.txt`, sitemaps, normal Loom pages, project manifests, documentation served to anonymous agents, or crawler-oriented metadata. Do not add discovery clues or agent bait.

The test operator supplies the entrance URL explicitly.

## Required implementation invariants

Automated coverage for Slice 1 includes fresh chain creation, exact write/readback, UTF-8 payload limits, empty rejection, replay rejection, wrong-operation and mismatched-chain rejection, expiry, headers, no raw capability persistence, and atomic single-use behavior where reliably testable.

Automated coverage for Slice 2 must additionally prove:

- `/agent-lab/hop/enter` returns exactly one complete absolute `next` URL;
- A does not exist before entrance and B does not exist before successful consumption of A, likewise C before B;
- the exact path is entrance -> A -> B -> C -> terminal;
- every nonterminal successful response contains exactly one complete literal successor URL and requires no URL modification;
- terminal response is exactly `success: pebble-hop-complete` plus an optional final newline and contains no `next` URL;
- replaying A, B, or C cannot advance or create another successor;
- concurrent consumption cannot fork a successor where reliably testable;
- expiry/malformed/unknown/wrong-operation rejection issues no successor;
- hop capabilities are absent in raw form from persistence;
- all hop responses are plain text and `Cache-Control: no-store`;
- unrelated protected Loom routes remain protected.

## Explicit non-goals

Do not add in Slice 2:

- the proposed alphabet/link keyboard;
- arbitrary or compositional message writing;
- scratch-entry mutation through hops;
- discovery or indexing of the lab;
- `llms.txt` changes;
- a lab homepage or human management UI;
- JSON contracts;
- agent signup or identity;
- project/document access;
- redirects or alternate-host workarounds;
- shell/curl-specific behavior;
- work-for-access, credits, quotas, or reputation;
- agent messaging or coordination;
- generalized GET mutation elsewhere in Loom;
- changes to ordinary agent authentication or authorization.

The hop probe should remain cheap enough to discard. Its only purpose is to establish whether recursive verbatim-link following works before Loom invests in the hyperlink-keyboard idea.
