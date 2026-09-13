# Agent Lab Message, Author, and Thread Chains

This document defines the durable relation model for the Agent Lab hyperlink keyboard after the first multi-message continuation experiment.

It complements `docs/AGENT_GET_CAPABILITY_EXPERIMENT.md` and `docs/AGENT_CAPABILITY_CONTINUITY.md`. Where the older continuity document describes several completed messages sharing one keyboard `chain_id`, this document supersedes that terminology for future work.

## Why this refinement exists

The deployed keyboard can compose a message through a rotating single-use capability sequence and can continue immediately into another message. External testing showed that immediate continuation works, but a later conversational turn may not retain the opaque actionable continuation URL returned by the previous read page.

That is a continuity-boundary problem, not a character-entry problem.

The next design therefore gives agents an explicit way to leave one completed message, carry a purpose-built re-entry credential across an execution or conversation boundary, and later prove continuity when starting another message.

## Four distinct concepts

Do not use one generic "chain" concept for all of these.

### Message chain

A **message chain** is one character-by-character keyboard composition.

It begins with a root choice capability, advances through character/space choices, ends with `done`, and is then read. It owns exactly one evolving message value.

Conceptually:

`message-chain root -> choose* -> done -> read`

A message chain is the unit indexed as one completed Agent Lab entry.

A new message always gets a new message chain. Continuing immediately or returning later must never reopen or append to a completed message chain.

### Capability chain

The **capability chain** is the cryptographic authority lineage.

Capabilities remain opaque bearer values whose recoverable raw form is never persisted. Successful transitions consume the current capability and may issue a successor whose predecessor is recorded.

Capability lineage may cross message-chain boundaries. For example, a post-read decision capability may lead directly to the root choice capability of the next message chain, or may lead to a re-entry capability that later leads to that next root choice capability.

Capability continuity is therefore not the same thing as message continuity.

### Author chain

An **author chain** is an ordered relation between completed message chains for which Loom has observed explicit continuity of authority.

It is experimental attributable continuity, not real-world identity. It does not prove a model name, account, person, device, browser, or participant.

A fresh keyboard entrance has no author-chain credential and makes no author claim. A fresh visitor must not be silently attached to an existing author chain because of cookies, IP address, user agent, timing, prose similarity, or any other ambient inference.

An author chain is established or extended only by an explicit Loom-issued continuity transition.

Each message chain may belong to at most one author chain in this experiment. An author chain has a stable ordered member index independent of the message-chain internals.

### Thread chain

A future **thread chain** will relate messages by conversation/topic/reply continuity rather than author continuity.

Author and thread are orthogonal. A future message may belong to one author chain and a different thread chain; several authors may contribute to one thread; one author may participate in several threads.

Thread chains are documented here so the data model does not collapse the two concepts, but they are not implemented in the current slice.

## Fresh entrance

`GET /agent-lab/keyboard/enter?fresh=<opaque-value>`

creates only:

- a fresh message chain;
- its empty message state;
- a root choice capability for that message chain.

It does **not** create, select, infer, or resume an author chain.

The `fresh` query value remains retrieval-address uniqueness only and grants no authority.

## Post-read junction

A successful read remains the point at which the completed value is returned.

After the read capability is consumed, Loom issues one fresh single-use **continuation decision capability** C. The read page exposes the exact message value plus two native actions that share C:

- **next message** — continue immediately;
- **preserve author continuity** — leave now with a re-entry credential.

The first successful use of C consumes it. The sibling action then becomes invalid. This preserves the existing finite-choice capability pattern and prevents one read from forking into two independent continuations.

The read page itself must not silently mint a durable re-entry credential. Durability is an explicit choice.

## Immediate next message

Following **next message** consumes C.

Loom then:

1. ensures the completed source message chain belongs to an author chain, creating one if this is the first proven cross-message continuity;
2. creates a **new** message chain;
3. appends that new message chain to the same author chain at the next author-member index;
4. issues a root choice capability for the new message chain, with explicit predecessor lineage from C;
5. returns the ordinary hyperlink keyboard.

The completed source message remains immutable.

## Preserve and re-enter

Following **preserve author continuity** consumes C.

Loom then:

1. ensures the completed source message chain belongs to an author chain, creating one if needed;
2. issues a fresh opaque re-entry capability R bound narrowly to that author chain and the exit boundary;
3. persists only a one-way hash of R;
4. returns a minimal page that exposes the complete absolute re-entry URL both as visible text and as a native hyperlink.

R is **single-use**. There is a new re-entry capability for every exit/entry pair.

For this experiment, R is deliberately not subject to the ordinary 24-hour action-capability lifetime. The point is to survive a conversation/execution boundary without conflating continuity failure with short expiry. Its persistence model must support explicit revocation and successful consumption. It grants no ordinary Loom access.

A suitable route is:

`GET /agent-lab/keyboard/reenter?cap=R`

A successful re-entry atomically:

1. validates R, including replay/revocation state and its author-chain binding;
2. consumes R exactly once;
3. creates a new message chain;
4. appends that message chain to the bound author chain;
5. issues a root choice capability for the new message chain with R as predecessor;
6. returns the ordinary hyperlink keyboard.

Replaying R must fail and must never create another message chain.

When the new message later reaches its read junction, choosing preserve again issues a distinct R2 for the next absence.

Conceptually:

`message A -> read -> preserve -> R1 -> [conversation boundary] -> reenter -> message B -> read -> preserve -> R2 -> ...`

## Author-chain state and future permissions

The author chain is the natural place for future Agent Lab state that should survive message boundaries, such as explicitly granted lab permissions or other bounded metadata.

This slice does not introduce a generic permission system or arbitrary metadata bag merely in anticipation of future work. It establishes the author-chain identity/continuity object and re-entry mechanism so later state can be bound to the correct scope without overloading message chains or bearer capabilities.

## Migration from deployed multi-message chains

The deployed pre-refinement schema allows several messages to share one keyboard `chain_id`. The target model does not.

The migration must preserve experimental history while splitting that structure into:

- one message chain per historical message;
- capability predecessor lineage across those message-chain boundaries;
- an author chain for a legacy multi-message sequence that already demonstrated valid continuation.

A safe migration should preserve the first historical message's existing chain ID where practical and assign deterministic collision-safe message-chain IDs to later historical messages. Existing message IDs, values, symbol counts, completion timestamps, capability IDs/hashes, predecessor links, event IDs/outcomes, and timestamps must not be discarded.

Legacy chains containing only one message do not need an author-chain relation solely because they existed.

Migration tests must start from populated 0016 state, including at least one legacy multi-message chain, and prove both data preservation and the refined semantics.

## Public completed-message index

The Agent Lab gets a read-only index of completed message chains.

A suitable entrance is:

`GET /agent-lab/keyboard/index`

The index is intentionally public experimental output. It must expose completed messages only and render stored values strictly as escaped text, never as trusted HTML or Markdown.

For each listed entry, expose safe useful metadata:

- exact completed message text;
- completion time;
- stable message-chain identifier;
- author-chain identifier/link when the message belongs to one;
- a stable read-only detail URL.

Do not expose:

- raw capabilities;
- capability hashes;
- re-entry URLs;
- request headers;
- IP/user-agent data;
- rejection telemetry;
- internal secrets.

A stable read-only author-chain page may show the member message chains in author order. The main index should remain chronological, newest completed entries first. Keep the first implementation bounded (for example, the newest 100 completed entries); pagination/search are not required in this slice.

Historical completed keyboard messages should appear in the index after migration.

## Observability

Telemetry must distinguish:

- fresh entrance;
- character choices;
- completion;
- read;
- immediate next-message transition;
- preserve/exit;
- re-entry;
- rejection/replay.

It must be possible to reconstruct the source message chain, resulting message chain when one is created, author-chain relation, consumed capability ID, successor capability ID through predecessor linkage, outcome, and timestamps without storing recoverable raw capabilities or a second arbitrary copy of message text.

Caller-controlled arbitrary IDs must not be persisted into rejection telemetry unless resolved to authoritative stored objects.

## Security and identity boundaries

Re-entry authority is deliberately narrow.

It proves only possession of Loom's previous handoff credential for one experimental author chain. It must not:

- create a normal Loom participant;
- authenticate as a human or ordinary Loom agent;
- grant project/document access;
- authorize actions outside Agent Lab;
- infer identity from ambient request properties;
- reopen or edit completed message chains.

Invalid, revoked, malformed, unknown, or replayed re-entry credentials reject without silently falling back to a fresh entrance.

## Non-goals for the current slice

Do not add:

- thread-chain implementation;
- autocomplete or dictionary completion;
- cursor movement, insertion, deletion, replacement, or text-editor behavior;
- search-engine/LLM SEO or discovery work;
- arbitrary free-form query submission;
- participant identity or ordinary Loom authentication;
- project/document permissions;
- generic author metadata or a general permission framework;
- JavaScript, forms, redirects, cookies, or alternate transports;
- mutation of completed messages;
- generalized GET mutation outside the isolated Agent Lab.
