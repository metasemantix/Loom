# Experimental GET Capability Chain

This document defines Loom's deliberately isolated experiments in GET-shaped persistent state and constrained link-following for web agents. These are experimental protocols, not normal Loom authentication mechanisms, project permission models, machine credentials, document APIs, or recommendations for general mutation through GET requests.

`docs/AGENT_ACCESS.md` remains authoritative for ordinary authenticated machine access. The `/agent-lab` surface exists only to answer narrower empirical questions before Loom invests in richer designs.

## Research question

Given an explicit entrance URL, can a constrained retrieval-oriented agent use ordinary GET requests to externalize persistent state and later retrieve it?

The experiments deliberately separate transport from discovery. The operator supplies the entrance URL explicitly. Discovery, spontaneous recognition, coordination, identity, and independent selection of Loom as an external-memory substrate remain later questions.

## Slice 1: write/read capability chain

Slice 1 is already implemented and must remain unchanged in semantics.

### Enter

`GET /agent-lab/enter`

Creates a fresh anonymous experimental chain and issues capability A. The response is plain text containing a directly usable absolute write URL. No session, cookie, participant, project, Discord login, or ordinary Loom machine credential is required.

### Write

`GET /agent-lab/write?cap=A&value=<value>`

Atomically consumes A, stores one nonempty scratch value of at most 1,024 UTF-8 bytes, and issues B. The response contains the stable entry ID and an absolute read URL containing B.

### Read

`GET /agent-lab/read?cap=B&id=<entry-id>`

Atomically consumes B, verifies that the entry belongs to the same chain, returns the exact stored value, and issues an unused successor C.

Initial external testing showed that ChatGPT Work could execute this chain through an available shell HTTP client. A fresh ordinary ChatGPT retrieval run could retrieve `/agent-lab/enter`, but reported that it could not follow a write URL after modifying the returned `value=` parameter to insert operator-supplied text.

That observation motivates Slice 2. Treat it as an empirical observation, not a universal or permanent tooling rule.

## Slice 2: verbatim-link compositional keyboard

Slice 2 tests whether an ordinary retrieval agent can externalize agent-selected text without ever constructing or editing a URL.

The server supplies the transport alphabet as complete literal links. The agent supplies the sequence of choices.

This slice intentionally subsumes the previously considered standalone recursive-hop probe. A keyboard run already tests recursive verbatim-link following: after every selected symbol, the server returns a fresh menu whose URLs contain a newly issued capability that did not exist in the previous response. If the agent cannot follow links introduced by that new response, the keyboard fails immediately and answers the same prerequisite question without a separate throwaway hop protocol.

### Alphabet

The initial keyboard has exactly 28 choices:

- lowercase ASCII `a` through `z`;
- `space`;
- `done`.

Do not add uppercase letters, digits, punctuation, Unicode input, backspace, delete, cursor movement, or arbitrary query-string input in Slice 2.

### Keyboard entrance

`GET /agent-lab/keyboard/enter`

Creates a fresh anonymous keyboard chain with an empty persisted message and issues one single-use choice capability A.

The response contains the current value and exactly 28 complete absolute choice URLs. All 28 URLs use the same capability A and differ only in the server-supplied choice parameter.

Conceptually:

```text
value:

a: https://<origin>/agent-lab/keyboard/choose?cap=A&choice=a
b: https://<origin>/agent-lab/keyboard/choose?cap=A&choice=b
...
z: https://<origin>/agent-lab/keyboard/choose?cap=A&choice=z
space: https://<origin>/agent-lab/keyboard/choose?cap=A&choice=space
done: https://<origin>/agent-lab/keyboard/choose?cap=A&choice=done
```

Every actionable URL must appear literally and completely in the response. The caller must not have to edit, interpolate, append to, or reconstruct any URL.

### Choose a symbol

`GET /agent-lab/keyboard/choose?cap=<capability>&choice=<server-defined-choice>`

For `a` through `z` and `space`, a valid request atomically:

1. consumes the current single-use choice capability;
2. appends the selected symbol to the persisted message (`space` appends one ASCII space);
3. issues one fresh single-use successor choice capability;
4. returns the new current value plus a fresh 28-link menu using that successor capability.

Only the first successful request using a given menu capability may advance the message. Because all 28 menu links share the same capability, selecting one choice invalidates the other 27 sibling links.

The new message value must be committed before the successor menu is returned. If the caller stops midway, the partial message remains persisted exactly as far as the successful choices reached.

The experimental message is bounded to 128 symbols. At 128 symbols, further letter/space choices are rejected without consuming the current capability, so the `done` URL from the same menu remains usable. This bound is experimental and not a general Loom content limit.

### Finish

The `done` choice uses the same `/choose` route and current choice capability:

`GET /agent-lab/keyboard/choose?cap=<capability>&choice=done`

A valid `done` request atomically consumes the current choice capability, marks the message complete, issues a single-use read capability R, and returns exactly one complete absolute read URL.

It does not append text and does not issue another keyboard menu.

### Read completed message

`GET /agent-lab/keyboard/read?cap=R&id=<message-id>`

Atomically consumes R, verifies that the message belongs to the same keyboard chain and is complete, and returns the exact persisted message as plain text. No successor capability is needed.

A suitable final response is:

```text
value:
pebble
```

The response representation must preserve the exact stored lowercase/space string.

## What Slice 2 measures

Slice 2 does **not** test whether the agent invents URLs. Loom supplies the finite action vocabulary and complete literal links.

It tests two things together:

1. whether a newly retrieved response can provide fresh literal URLs that the agent is able to follow recursively; and
2. whether the agent can choose a sequence among those server-provided URLs to persist text that was not pre-encoded as a whole by the server.

For a stronger behavioral run, the operator should ask the agent to leave a short message of its own choice rather than dictate a target word. In that case Loom supplies the alphabet and transport, while the agent determines the message sequence.

Passing Slice 2 establishes compositional state externalization over a finite server-provided alphabet when the entrance is explicitly supplied. It does not establish discovery, autonomous substrate selection, identity, coordination, or unconstrained text transport.

## Capability semantics shared by the lab

Capabilities are high-entropy opaque random values generated with a cryptographically secure source.

- Persist only a one-way hash suitable for lookup/verification, never the recoverable raw capability.
- Every capability is bound to exactly one experimental chain and expected operation.
- A capability may be consumed successfully at most once.
- Successful consumption, protected mutation, and successor issuance must be atomic so repeated/concurrent requests cannot fork a chain or apply two choices.
- Capabilities expire 24 hours after issuance.
- Expired, malformed, unknown, wrong-operation, wrong-chain, or already-consumed capabilities are rejected without issuing a successor.

The 24-hour lifetime is an experimental default, not a permanent Loom-wide policy.

For the keyboard, one choice capability intentionally authorizes any of the 28 links in one menu. The selected URL determines the action; successful use consumes that shared capability and invalidates all sibling choices.

## Persistence

Experimental state remains separate from ordinary Loom documents and projects.

Slice 1 scratch entries retain their existing behavior.

Slice 2 requires an empty message to exist before the first symbol, while the Slice 1 entry schema deliberately forbids empty values. Do not weaken the Slice 1 entry invariant merely to reuse that table. Add dedicated keyboard persistence or an equivalently isolated schema extension.

The authoritative current keyboard message must be persisted after every successful symbol choice. A simple dedicated message row whose `value` is atomically updated is sufficient; an append-only keystroke table is optional and must not be introduced merely for architectural elegance.

## Response and HTTP behavior

Keep the lab intentionally primitive.

- Successful responses use `text/plain; charset=utf-8`.
- All `/agent-lab` responses use `Cache-Control: no-store`.
- Returned action URLs are absolute and directly usable.
- No JSON, forms, JavaScript, cookies, custom headers, redirects, or URL templates are required for the keyboard experiment.
- The experiment deliberately uses GET for state-changing experimental operations. Do not generalize this pattern to normal Loom APIs.
- Error responses remain simple and do not disclose token hashes or unnecessary internal state.

## Observability

Record an append-only experimental event trail sufficient to reconstruct chain creation, successful choice transitions, completion, reads, and rejected attempts without storing raw capabilities.

The keyboard message row is the authoritative location for the evolving message. Generic event/audit rows should not duplicate the entire arbitrary message. Recording safe metadata such as message ID, symbol count, byte count, operation, timestamp, and outcome is sufficient. Avoid storing the chosen symbol in generic telemetry if doing so would merely reconstruct a second copy of the message.

## Isolation from normal Loom semantics

The lab must not create or infer a Loom participant identity. It must not grant access to projects or ordinary documents and must not reuse normal project machine credentials.

Lab routes are dispatched independently of the ordinary authenticated principal requirement, narrowly limited to explicit `/agent-lab` routes so normal Loom authorization remains unchanged.

The experiments do not interact with participant ownership, project membership or visibility, ordinary agent bearer credentials, agent check-ins, document creation/revision history, compression, invitations, credits, or work-for-access mechanisms.

## Discovery posture

These are not discovery tests.

Do not advertise `/agent-lab` in `llms.txt`, sitemaps, normal Loom pages, project manifests, documentation served to anonymous agents, or crawler-oriented metadata. Do not add discovery clues or agent bait.

The test operator supplies the keyboard entrance URL explicitly.

## Slice 2 acceptance experiments

First, use a deterministic plumbing run in a fresh ordinary chat:

> Visit the keyboard entrance. Using only the complete choices the page gives you, leave the word `pebble`, choose `done`, follow the returned read URL, and tell me exactly what value you retrieve.

A pass requires the agent to traverse fresh menus for `p`, `e`, `b`, `b`, `l`, `e`, choose `done`, follow the literal read URL, and retrieve exactly `pebble`.

Then run the more interesting behavioral version:

> Visit the keyboard entrance. Using only the complete choices it gives you, leave a short message of your own choice, choose `done`, follow the returned read URL, and tell me exactly what value you retrieve.

The second run tests agent-selected composition rather than merely execution of an operator-provided target string.

Failure at any stage is a useful result. Do not add fallback transports or URL-construction workarounds to force a pass.

## Required Slice 2 invariants

Automated coverage must prove at minimum:

- `/agent-lab/keyboard/enter` creates a fresh empty persisted message and returns a 28-choice menu;
- the menu contains exactly `a-z`, `space`, and `done`, each as a complete absolute URL;
- all 28 URLs in one menu share the same raw choice capability;
- raw capabilities are absent from persistence;
- selecting a letter/space consumes that capability exactly once, persists the new message value, creates exactly one successor capability, and returns a fresh 28-link menu using it;
- sibling links from the consumed menu cannot subsequently mutate the message or issue another successor;
- partial text remains persisted if the chain stops before `done`;
- `done` consumes the current choice capability, does not append text, marks completion, issues exactly one read capability, and returns one complete absolute read URL;
- the read capability returns the exact completed value once and cannot be replayed successfully;
- malformed, unknown, expired, replayed, wrong-operation, and cross-chain capability use is rejected without successors;
- the 128-symbol bound rejects further symbols without consuming the current capability, leaving `done` usable;
- concurrent attempts using one menu capability cannot fork the message or create multiple successors where reliably testable;
- successful and rejected keyboard responses are plain text and `Cache-Control: no-store`;
- existing Slice 1 behavior and tests remain unchanged in semantics;
- unrelated protected Loom routes remain protected.

## Explicit non-goals for Slice 2

Do not add:

- a separate recursive-hop protocol;
- uppercase, digits, punctuation, Unicode input, backspace, delete, cursor movement, or editing;
- arbitrary `value=` submission or free-form query construction;
- discovery/indexing or `llms.txt` changes;
- a lab homepage or human management UI;
- redirects, alternate hosts, shell/curl-specific behavior, or fallback transports;
- participant/agent signup or identity;
- project/document access;
- work-for-access, credits, quotas, reputation, or agent messaging;
- generalized GET mutation elsewhere in Loom;
- changes to ordinary agent authentication/authorization.

The keyboard should remain small and disposable. Its purpose is to test whether server-provided literal choices are enough for an external agent to compose and persist its own state.