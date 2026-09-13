# Agent Lab Capability Continuity

This document defines the continuity model for future `/agent-lab` capability-chain work. It extends the experimental GET capability architecture in `docs/AGENT_GET_CAPABILITY_EXPERIMENT.md` without retroactively rewriting the behavior of already deployed experiments.


> **Terminology/status refinement (2026-09-13):** PR #38 deployed the multi-message continuation lifecycle described below. Follow-up external testing then exposed a separate conversation-boundary problem: an agent can continue immediately, but may not retain the opaque post-read continuation action across a later chat turn. The next slice therefore introduces explicit author re-entry semantics. Going forward, **message chain** means one character-by-character keyboard composition ending in one completed message; the cryptographic **capability chain** is the predecessor/successor authority lineage and may cross message-chain boundaries; an **author chain** is an ordered relation between completed message chains proven by Loom-issued continuity handoffs; a future **thread chain** is an independent conversational relation. The older sections below that describe multiple messages sharing one keyboard `chain_id` are the deployed pre-refinement model and are migration input, not the target semantic model. The durable target is specified in `docs/AGENT_LAB_RELATION_CHAINS.md`.

The core design goal is to preserve attributable continuity across multiple agent interactions without turning one bearer capability into a long-lived session token.

## Design principle

A successful read should normally be a transition, not a dead end.

The currently deployed keyboard ends at:

`enter -> choose* -> done -> read -> stop`

The next continuity slice changes the keyboard lifecycle to:

`fresh enter -> choose* -> done -> read -> continue -> choose* -> done -> read -> continue -> ...`

Each successful capability use consumes the current capability and, where another action follows, atomically issues a fresh successor. Continuity is carried by the chain and explicit capability lineage, not by reusing one bearer token indefinitely.

`done` completes one message. It does not complete the capability chain.

## Root and re-entry

When no usable predecessor capability exists, Loom may start a new experimental chain through the keyboard entrance and issue a new root choice capability.

A new root is not inferred from cookies, IP addresses, user-agent strings, participant identity, model identity, or other ambient state. Independent roots must never be silently merged because they appear to come from the same external agent or interface.

Controlled external-agent runs should use the unique entrance-address mechanism defined in `docs/AGENT_GET_CAPABILITY_EXPERIMENT.md`, for example a never-before-used:

`GET /agent-lab/keyboard/enter?fresh=<opaque-random-value>`

The freshness value is retrieval-address uniqueness only. It is not chain authority, is not a bearer capability, and does not replace the freshly issued root choice capability.

An absent or invalid continuation capability on the continuation route is rejected. Starting a new root is an explicit entrance operation rather than a fallback that silently converts a failed continuation into a new chain.

## Message lifecycle inside a chain

A keyboard chain may contain multiple messages.

Messages are ordered within the chain by a stable 1-based `message_index`:

- the entrance creates message 1;
- every successful continuation creates exactly one next message with index `previous + 1`;
- `(chain_id, message_index)` is unique;
- each message keeps its own value, symbol count, creation time, and completion time.

The existing invariant that `chain_id` is unique in the keyboard-message table must therefore be removed. One chain may have many messages, while one message still belongs to exactly one chain.

Historical messages created before continuity is introduced must be preserved and become message index 1 for their existing chains. Do not regenerate their IDs or contents.

## Capability lineage

The experimental chain is the continuity spine.

For capabilities created after this model is implemented:

- every capability belongs to exactly one chain;
- every capability is bound to the message relevant to its operation;
- the first choice capability issued by an entrance is a root and has no predecessor capability;
- every later capability records the capability whose successful consumption issued it;
- one single-use predecessor may issue at most one successor unless a future experiment explicitly introduces controlled branching;
- a consumed capability never becomes valid again;
- raw capability values remain non-recoverable and are never persisted.

The capability persistence model therefore needs a nullable predecessor reference such as `predecessor_capability_id`.

Do not invent lineage for historical capabilities. Existing rows may retain a null predecessor where the old schema did not record issuance linkage. New post-migration successor issuance must populate the predecessor reference consistently.

The lineage is intended to make sequences reconstructable as explicit edges rather than guessed from timestamps:

`root choice -> ... -> final choice -> read -> continue -> next-message choice -> ...`

## Completion and read

The existing `done` transition remains conceptually unchanged:

1. consume the current choice capability exactly once;
2. mark the current message complete;
3. issue one fresh read capability bound to that completed message;
4. return exactly one native `read` hyperlink.

The read operation then becomes a continuing transition.

`GET /agent-lab/keyboard/read?cap=<read-capability>&id=<message-id>`

A successful read must atomically:

1. verify the read capability, chain, message, expected operation, expiry, completion state, and message ID;
2. consume the read capability exactly once;
3. issue one fresh single-use continuation capability on the same chain, bound to the message that was read;
4. record the allowed read event;
5. return the exact stored message value together with exactly one native `continue` hyperlink carrying the new continuation capability.

Because external testing showed that page-native hyperlinks can matter, the successful read response is minimal HTML rather than terminal plain text. A suitable representation is conceptually:

```html
<!doctype html>
<meta charset="utf-8">
<pre id="value">pebble</pre>
<a href="https://<origin>/agent-lab/keyboard/continue?cap=C">continue</a>
```

The `pre#value` text content is the exact stored lowercase/space message after HTML decoding. Dynamic text and attributes must be escaped correctly.

Read rejection responses remain plain text and issue no successor.

## Continue into the next message

The concrete next-slice continuation route is:

`GET /agent-lab/keyboard/continue?cap=<continuation-capability>`

A continuation capability has expected operation `continue`. It is bound to the completed message whose successful read issued it.

A successful continuation must atomically:

1. verify that the capability is valid, unconsumed, unexpired, belongs to the expected chain, has expected operation `continue`, and is bound to a completed message;
2. consume the continuation capability exactly once;
3. create one new empty message on the same chain with `message_index = previous_message.message_index + 1`;
4. issue one fresh choice capability bound to that new message, with the consumed continuation capability recorded as its predecessor;
5. record an allowed continuation event;
6. return the ordinary 28-link keyboard menu for the new empty message.

The newly returned menu remains exactly the existing lowercase `a-z`, `space`, `done` alphabet. Autocomplete and larger action alphabets are not part of continuity.

A continuation request must not mutate the completed prior message. Replays or concurrent uses of one continuation capability must not create multiple next messages or multiple successor choice capabilities.

Continuation rejection responses remain plain text and issue no successor.

## Capability operation set

For the keyboard continuity slice, capability operations are:

- `choose`;
- `read`;
- `continue`.

This is deliberately an experimental operation vocabulary, not ordinary Loom authentication.

The post-read capability is intentionally a generic continuation boundary rather than a disguised reusable keyboard token. The current implementation of `continue` starts another keyboard message, but future lab primitives may use the same architectural boundary without changing the principle that every next action is explicitly scoped.

## Atomicity

Any successful transition that consumes a capability and issues a successor must be atomic.

This includes:

- character/space choice -> next choice capability;
- `done` -> read capability;
- read -> continuation capability;
- continue -> new message + root choice capability for that message.

A request must not be able to consume its predecessor while failing to record the protected state transition or required successor. Concurrent or replayed requests must not fork a single-use lineage.

## Persistence and migration

Introducing continuity requires an explicit migration from the currently deployed keyboard schema.

The migration must preserve existing chain IDs, message IDs, message values, symbol counts, completion timestamps, capability IDs/hashes/expiry/consumption data, event IDs, and timestamps.

The resulting schema must support at least:

- multiple messages per chain;
- stable `message_index` ordering with uniqueness per chain;
- `continue` as an expected capability operation;
- `continue` as an event operation;
- nullable predecessor-capability linkage for explicit post-migration lineage.

Do not reset or recreate experimental production history merely to simplify the migration.

Migration tests must exercise a populated pre-continuity keyboard database and prove semantic preservation as well as the new behavior.

## Observability

Telemetry should make continuity reconstructable without persisting recoverable raw capabilities or duplicating arbitrary message bodies.

For a continuation transition, safe records should make it possible to recover:

- the chain;
- the consumed continuation capability ID;
- the prior message through that capability's binding;
- the newly created message ID and index;
- the successor choice capability through its predecessor linkage;
- operation, outcome, timestamp, and bounded counters.

The generic event trail must not duplicate full message contents.

Caller-controlled IDs must not be persisted into rejection telemetry unless they have first been resolved to authoritative stored objects, preserving the existing keyboard telemetry rule.

## Relationship to ordinary Loom identity

Capability-chain continuity is attributable experimental continuity, not proof of a durable real-world agent identity.

It does not create a participant, account, machine credential, browser session, project membership, or cross-interface identity. A chain says that later allowed events followed possession and successful use of predecessor capabilities from that chain.

That narrower claim is intentional.

## Relationship to current Agent Lab slices

`docs/AGENT_GET_CAPABILITY_EXPERIMENT.md` remains the source of truth for the already deployed Slice 1 and Slice 2 behavior and for the fresh-entrance empirical finding.

Until the continuity implementation is deployed, the current Slice 2 read remains terminal. This document defines the durable design for the next keyboard continuity slice.

Slice 1 `/agent-lab/enter -> write -> read` is not changed by the keyboard continuity slice.

## Non-goals

This continuity model does not introduce:

- participant identity or ordinary Loom authentication;
- project or document access;
- discovery, indexing, crawler bait, or `llms.txt` exposure;
- cross-agent identity resolution;
- long-lived reusable bearer tokens;
- ambient session inference;
- uncontrolled capability branching;
- autocomplete, word prediction, dictionary completion, or a larger keyboard alphabet;
- forms, buttons, JavaScript controls, redirects, or alternate transports;
- generalized GET mutation outside the isolated lab.

Those concerns remain separate experiments or product decisions.
