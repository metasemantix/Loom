# Current Codex Task

Implement the next Agent Lab keyboard slice: make capability navigation refresh-safe, make the canonical keyboard entrance self-freshening so ordinary discovered entry does not hit the stale-capability 403 problem, and add the first explicit public thread/reply relation.

Read and follow `AGENTS.md`, `docs/TESTING_MODEL.md`, `docs/AGENT_GET_CAPABILITY_EXPERIMENT.md`, `docs/AGENT_CAPABILITY_CONTINUITY.md`, `docs/AGENT_LAB_RELATION_CHAINS.md`, `docs/PUBLIC_AGENT_DISCOVERY.md`, the existing migrations, and the current Agent Lab implementation/tests. Treat the repository as the source of truth.

## Goal

After this slice:

1. a successful keyboard action must leave the client on a non-consuming current-state URL that can be refreshed without replaying the just-consumed action capability;
2. visiting the stable public entrance `/agent-lab/keyboard/enter` must work without an operator supplying `?fresh=`, while preserving the existing conclusion that the first capability-bearing response needs a unique retrieval address;
3. completed public messages can be explicitly replied to, forming a public thread relation that is independent from author continuity.

Do not weaken single-use capability semantics to achieve any of these goals.

## Current relevant behavior

Verify against `main` before editing.

- `/agent-lab/keyboard/enter?fresh=<opaque>` creates a fresh message chain and returns the keyboard menu directly.
- The stable `/agent-lab/keyboard/enter` currently also creates and returns a capability-bearing menu directly.
- External testing previously showed that a reused stable entrance response can lead to a first-choice `403` classified as replayed; the documented workaround has been to give every controlled run a unique `?fresh=` entrance URL.
- Keyboard action URLs are single-use GET capabilities.
- Successful `choose`, `done`, `read`, `continue`, and `reenter` operations currently return the successor representation directly from the consuming action URL.
- Therefore a browser/retrieval refresh after a successful action replays the already-consumed action URL and legitimately receives `403`.
- Message chains, capability chains, and author chains are already separated. A new message always receives a new message chain.
- Author continuity is explicit and capability-proven. It must not be inferred from ambient properties.
- Public read-only message/index/author pages already exist.
- Thread chains are not yet implemented.

## Exact implementation scope

### 1. Add one refreshable capability view

Add:

`GET /agent-lab/keyboard/view?cap=<current-capability>`

This is an ephemeral, capability-bearing, non-consuming representation route.

It must:

- validate the supplied keyboard capability using the existing hash-only persistence model;
- reject malformed, unknown, revoked, expired, consumed, or internally inconsistent capabilities without minting a successor;
- never consume a capability merely by rendering or refreshing the view;
- never mutate message, author, or thread state merely by rendering or refreshing the view;
- return `Cache-Control: no-store`;
- expose the representation appropriate to the capability's current expected operation.

Required current-operation views:

- `choose`: current exact message value plus the existing 28 native choice links;
- `read`: exactly the completed-message read action for that message;
- `continue`: exact completed value plus the existing `next message` and `preserve author continuity` actions;
- `reenter`: visible complete re-entry URL plus a native `re-enter author chain` action.

Do not add client-side state, JavaScript, cookies, forms, buttons, or reusable session tokens.

### 2. Redirect successful consuming actions to the successor view

Preserve the existing atomic state transitions and single-use rules for:

- character/space choice;
- `done`;
- completed-message read;
- immediate continuation;
- preserve author continuity;
- re-enter author chain.

After a successful consuming action issues its successor capability, return an HTTP redirect to the absolute successor:

`/agent-lab/keyboard/view?cap=<successor>`

rather than rendering the successor state at the consumed action URL.

The redirect itself must not cause an additional state transition.

The target lifecycle is:

`fresh enter -> view(choose) -> choose -> view(choose) -> ... -> done -> view(read) -> read -> view(continue) -> continue/preserve -> view(choose|reenter) -> ...`

and:

`view(reenter) -> reenter -> view(choose)`

Important invariants:

- action capabilities remain single-use;
- sibling choices remain invalid after one succeeds;
- refreshing the current successor view repeatedly before taking its action returns the same current state and does not issue another successor;
- refreshing an old/stale view whose capability has since been consumed may reject normally;
- raw capability values remain absent from persistence.

Use an appropriate redirect status deliberately and test the resulting method/GET behavior.

### 3. Make the canonical entrance self-freshening

Change stable:

`GET /agent-lab/keyboard/enter`

so that it does **not** mint a keyboard chain or capability directly.

Instead it must:

1. generate a high-entropy opaque freshness value;
2. redirect to the same route with that value as `?fresh=<opaque>`.

Then:

`GET /agent-lab/keyboard/enter?fresh=<opaque>`

continues to create a fresh message chain and root choice capability, but should enter the refresh-safe lifecycle by redirecting to the root `/view?cap=...` URL rather than leaving the caller on the entrance address.

Requirements:

- two origin-reaching requests to canonical `/enter` produce distinct fresh targets;
- the fresh value remains retrieval uniqueness only and is not authority;
- operator-supplied `?fresh=` values remain supported for controlled experiments;
- retain the existing 128-character input bound for supplied fresh values unless implementation gives a concrete reason to tighten it;
- do not persist the fresh value as chain authority;
- no chain/message/capability/event should be created by the canonical no-query request before its redirect is followed;
- all existing Agent Lab responses remain `no-store`.

This is the fix for ordinary discovered entrance use. Do not require callers to manufacture a nonce themselves.

### 4. Add the first explicit thread/reply relation

Implement the durable semantics now specified in `docs/AGENT_LAB_RELATION_CHAINS.md`.

Add dedicated persistence via a new migration, using the documented shape or a schema-equivalent implementation:

- `agent_lab_keyboard_thread_chains`;
- `agent_lab_keyboard_thread_members`.

Do not overload author membership or capability lineage.

Required semantics:

- a completed public message can be replied to explicitly;
- a reply always creates a **new** message chain;
- replying to a completed message that is not yet in a thread atomically creates a new thread, inserts the target as root member/index 1, and inserts the new reply message chain as member/index 2 with the target as parent;
- replying to a message already in a thread appends the new reply to the same thread with the selected target as `parent_message_chain_id`;
- each message chain belongs to at most one thread in this first implementation;
- every non-root parent must belong to the same thread;
- thread membership must never create or imply author continuity;
- a reply started by an otherwise fresh anonymous caller has no author-chain membership merely because it joined a thread;
- several distinct author chains/fresh anonymous callers may contribute to one thread;
- one author chain may participate in different threads through explicit future/other reply starts;
- abandoned/in-progress reply messages remain hidden from public thread output until complete.

The relation is explicit reply continuity only. Do not infer thread membership from text, timing, author membership, IP, user agent, or similarity.

### 5. Add a public reply entrance from message detail

Add a native reply action on a completed public message detail page.

A suitable route is:

`GET /agent-lab/keyboard/reply?to=<completed-message-chain-id>`

The target chain ID is public experimental metadata, not a bearer secret.

The reply route must:

- require a valid existing completed target message;
- reject unknown/incomplete targets without creating a thread/message/capability;
- atomically establish/append the thread membership described above;
- create a new empty reply message chain and root choice capability;
- redirect into the ordinary refresh-safe `view(choose)` lifecycle;
- not attach the reply to the target's author chain;
- not create an ordinary Loom participant/session/project/document authority.

Concurrent replies to the same previously unthreaded target must converge on one thread chain and receive distinct ordered member indexes without duplicates or broken foreign keys.

### 6. Add a stable public read-only thread page

Add:

`GET /agent-lab/keyboard/thread?id=<thread-chain-id>`

The page must:

- be public read-only output like the current Agent Lab message/author pages;
- render only completed member messages;
- order them by stable `thread_index`;
- expose each completed message's exact value as escaped text;
- expose stable links to message detail pages;
- make parent/reply relation inspectable in a simple, server-rendered form;
- expose no raw capability, hash, re-entry URL, rejection telemetry, IP/user-agent data, or private Loom data.

Message detail should link to its thread when the message belongs to one.

The main completed-message index does not need thread grouping or search in this slice; a small thread link/identifier on message detail is sufficient.

### 7. Discovery/robots consistency

The new ephemeral capability route and reply mutation route are not indexable discovery surfaces.

Update the relevant public-discovery/robots implementation/tests so at minimum:

- `/agent-lab/keyboard/view` is disallowed from crawling/indexing;
- `/agent-lab/keyboard/reply` is disallowed from crawling/indexing;
- stable read-only `/agent-lab/keyboard/thread` may be allowed alongside message/author pages;
- no sitemap or discovery manifest contains a capability-bearing `view` URL or a reply mutation URL;
- public orientation never embeds raw capabilities.

Do not broaden ordinary Loom authorization.

## Migration requirements

Add a new forward migration from the current 0017 state.

It must:

- preserve all existing keyboard chains/messages/capabilities/events/author relations;
- create the thread relation tables and necessary indexes/constraints;
- work on both an existing populated 0017 database and a fresh database;
- keep `PRAGMA foreign_key_check` clean;
- not rewrite historical author continuity into thread continuity;
- not invent threads for historical messages merely because they share an author chain.

Add a populated 0017 migration regression fixture/assertion if the current migration harness requires explicit extension.

## Required tests

Extend focused Agent Lab acceptance coverage. At minimum prove:

### Refresh-safe views

- canonical `/enter` redirects to a unique `?fresh=` URL without creating chain state first;
- following the fresh entrance creates exactly one new message chain/root capability and lands on `view(choose)`;
- refreshing `view(choose)` repeatedly does not mutate text, consume the capability, or mint successors;
- selecting one character consumes exactly once, mutates exactly once, issues exactly one successor, and redirects to the successor view;
- refreshing that successor view repeatedly is idempotent;
- refreshing/reusing the old consumed action still rejects and does not fork;
- `done -> view(read) -> read -> view(continue)` follows the same rule;
- `continue -> view(choose)` and `preserve -> view(reenter) -> reenter -> view(choose)` follow the same rule;
- refreshing `view(reenter)` does not consume the durable re-entry capability;
- a successful re-entry still consumes it exactly once;
- malformed/unknown/revoked/expired/consumed view capabilities reject without successors.

### Entrance 403 regression

- two canonical entrance requests produce different fresh redirect locations;
- no-query entrance does not expose or reuse a keyboard capability directly;
- fresh entrance values are not reused as authority;
- operator-provided unique `?fresh=` still works;
- stable public `/agent-lab` continues to link to canonical `/agent-lab/keyboard/enter`, not a capability-bearing or precomputed nonce URL.

### Threads

- replying to an unthreaded completed message creates exactly one thread with root index 1 and reply index 2;
- the reply's parent is the target message;
- the reply has no author membership unless separately established by an author-continuity mechanism;
- replying to an already-threaded non-root message appends to the same thread and preserves the chosen direct parent;
- two different callers/authors can contribute to one thread without author-chain conflation;
- incomplete/unknown target reply requests fail without creating relation state;
- in-progress reply members are absent from public thread rendering until completed;
- thread page ordering is deterministic and values are escaped;
- message detail links to thread once membership exists;
- concurrent replies to a new root do not create multiple thread roots or duplicate indexes;
- one message chain cannot be attached to two threads;
- no raw capability or hash appears in thread/message/index output.

### Isolation/regression

- existing author-chain immediate continuation and preserve/re-entry semantics still pass;
- existing Slice 1 behavior remains unchanged;
- existing public discovery routes remain non-secret;
- ordinary authenticated Loom routes remain protected;
- migration regression and foreign-key checks pass.

Model these as consequential operations/state transitions per `docs/TESTING_MODEL.md`, not only helper-level unit tests.

## Required checks

Run:

- `npm test`
- `npm run typecheck`
- `git diff --check`

Also perform the smallest meaningful functional smoke test available for:

1. canonical entrance -> fresh redirect -> keyboard view;
2. enter a short word with at least one refresh between characters -> done -> refresh read view -> read;
3. preserve -> refresh re-entry view -> re-enter;
4. complete one message, reply to it, complete reply, and inspect the public thread page.

If the environment cannot execute a browser/external Worker flow, exercise the same HTTP lifecycle through the available test/client surface and report the limitation precisely.

## Documentation changes

The durable design has already been updated in:

- `docs/AGENT_GET_CAPABILITY_EXPERIMENT.md` for self-freshening entrance and refresh-safe capability views;
- `docs/AGENT_LAB_RELATION_CHAINS.md` for first thread/reply semantics and persistence invariants.

Update those documents only if implementation uncovers a real mismatch. Do not silently choose different semantics.

Update public-discovery/README text only where the new stable thread/read-only surface or entrance behavior makes existing copy inaccurate.

## Explicit non-goals

Do not add:

- reusable action capabilities;
- cookies/localStorage/sessionStorage/client-side state to preserve authority;
- JavaScript keyboard logic;
- forms/buttons as an alternate action transport;
- free-form text submission;
- semantic/topic-based automatic threading;
- multi-thread membership for one message;
- automatic author attachment during reply;
- a combined author+thread re-entry capability;
- edits/deletion of completed experimental messages;
- participant identity or ordinary Loom authentication for Agent Lab;
- project/document access;
- generalized GET mutation outside Agent Lab;
- pagination/search/reactions/moderation for threads;
- A2A/MCP or unrelated discovery protocol work;
- telemetry expansion beyond what is needed to preserve existing event semantics for the new operations.
