# Agent Lab Capability Continuity

This document defines the intended continuity model for future `/agent-lab` capability-chain work. It extends the experimental GET capability architecture documented in `docs/AGENT_GET_CAPABILITY_EXPERIMENT.md` without changing the already-implemented Slice 1 or Slice 2 semantics retroactively.

The core design goal is to preserve attributable continuity across multiple agent interactions without turning a bearer capability into a long-lived session token.

## Design principle

A successful read should normally be a transition, not a dead end.

The current keyboard experiment ends at:

`enter -> choose* -> done -> read -> stop`

For longer-lived experimental interaction, the preferred lifecycle is:

`root -> write/choose* -> complete -> read -> successor -> next action -> ...`

Each successful capability use consumes the current capability and atomically issues a fresh successor. Continuity is carried by the chain linkage, not by reusing one bearer token indefinitely.

## Successor after read

When a read capability is successfully consumed, Loom should:

1. verify the capability, chain, target, and expected operation;
2. perform the read;
3. consume the read capability exactly once;
4. atomically issue a fresh successor capability bound to the same experimental chain;
5. return the requested value together with a directly usable action that carries the successor capability.

The successor must be fresh, high-entropy, single-use, hashed at rest, and subject to the same expiry and replay rules as other lab capabilities.

A read therefore remains attributable to the chain while also handing the caller a clean continuation point.

## Re-entry when no predecessor exists

Loom must also permit graceful re-entry when no usable predecessor capability is available.

If an interaction begins without a valid continuation capability, Loom may mint a new root capability and a new chain root rather than attempting to infer continuity from cookies, IP addresses, user-agent strings, participant identity, or other ambient state.

A new root must be explicitly distinguishable in persistence and telemetry from a successor issued from an existing chain.

Do not silently merge independent roots merely because they appear to come from the same external agent or interface.

## Chain identity and attribution

The experimental chain is the continuity spine.

- Every capability belongs to exactly one chain.
- Every non-root capability should be attributable to one successful predecessor transition.
- Every successful transition should have at most one successor unless a later protocol explicitly introduces a controlled branching primitive.
- A consumed capability must never become valid again.
- Capability rotation, not bearer-token reuse, preserves continuity.
- Cookies, login sessions, IP addresses, user-agent strings, and inferred model identity are not authoritative chain identity.

This allows Loom to reconstruct an attributable event sequence such as:

`root -> write hello -> read hello -> write second message -> read second message -> ...`

without requiring ordinary Loom authentication or pretending that the lab has established a durable real-world agent identity.

## Generic continuation capability

Do not hard-wire the post-read successor permanently to the current character keyboard.

The preferred abstraction is a continuation capability whose allowed next operation or action set is explicit and narrow. A concrete implementation may initially bind the successor to one experimental continuation route, but the data model should not assume that all future continuation means "type another keyboard character."

This leaves room for later lab primitives such as a new message, a different finite-choice surface, or another explicitly scoped experiment while keeping one capability lineage.

## Atomicity

A transition that consumes a capability and issues its successor must be atomic.

A successful request must not be able to consume the predecessor without recording the transition and successor. Concurrent or replayed requests must not create parallel successors from one single-use predecessor unless a future experiment deliberately defines branching as part of the protocol.

If successor issuance fails, the protected transition should fail rather than silently severing the chain.

## Observability

Telemetry should make continuity reconstructable without persisting recoverable raw capabilities or duplicating arbitrary message bodies.

Where practical, events should expose safe linkage metadata sufficient to answer:

- which chain this event belongs to;
- whether the consumed capability was a root or successor;
- which operation was attempted;
- whether it was allowed or rejected;
- which prior transition issued the consumed capability;
- whether a successor was issued;
- which safe target/message/entry identifier was involved;
- timestamp and relevant bounded counters.

Raw capability values must never be stored in telemetry.

## Relationship to completion

`done` should mean "this message is complete," not "this agent is permanently finished interacting with Loom."

Completing one message may still transition to a read step. Reading that completed message should then provide a successor continuation capability so the same attributable chain can proceed to another interaction.

Message lifecycle and capability-chain lifecycle are therefore separate concepts:

- a message may be complete;
- the capability chain may continue.

This distinction is intentional and architectural.

## Relationship to current Agent Lab slices

`docs/AGENT_GET_CAPABILITY_EXPERIMENT.md` remains the source of truth for the already implemented Slice 1 and Slice 2 behavior.

In particular, the current Slice 2 read is a terminal step. That remains historically and behaviorally accurate until a dedicated implementation slice changes it.

This document defines the intended next-generation continuity rule and should be referenced by any task that implements post-read continuation.

## Non-goals

This continuity model does not by itself introduce:

- participant identity;
- ordinary Loom authentication;
- project or document permissions;
- discovery or indexing;
- cross-agent identity resolution;
- long-lived reusable bearer tokens;
- ambient session inference;
- uncontrolled capability branching;
- autocomplete, word prediction, or a larger keyboard alphabet.

Those concerns should remain separate experiments or product decisions.
