# Current Codex Task

Implement the next Agent Lab keyboard slice: refine the deployed multi-message keyboard into one message chain per completed message, add explicit author-chain continuity with one-time re-entry handoffs across conversation/execution boundaries, and expose a safe read-only index of completed entries.

Read and follow `AGENTS.md`, `docs/TESTING_MODEL.md`, `docs/AGENT_GET_CAPABILITY_EXPERIMENT.md`, `docs/AGENT_CAPABILITY_CONTINUITY.md`, `docs/AGENT_LAB_RELATION_CHAINS.md`, and the current implementation/tests. Treat the repository as the source of truth.

## Goal

Production/external testing established two facts:

1. immediate post-read continuation can successfully write another message;
2. a later conversational turn may not retain the opaque actionable continuation URL returned by the previous read page.

The next slice must therefore separate:

- one **message chain** for one character-by-character message;
- the cryptographic **capability chain** that may cross message boundaries;
- an **author chain** relating completed message chains when continuity is explicitly proven;
- a future, separate **thread chain** that is documented but not implemented here.

The target cross-boundary lifecycle is:

`fresh entrance -> message chain A -> done -> read -> preserve -> R1 -> later reenter -> message chain B -> done -> read -> preserve -> R2 -> ...`

Immediate continuation remains supported:

`message chain A -> read -> next message -> message chain B`

In both cases A and B become ordered members of the same author chain. A fresh entrance by itself has no author-chain credential and must not be treated as a returning author.

Also add a public read-only index of completed Agent Lab keyboard entries.

## Current relevant behavior

Verify against `main` before editing.

- PR #38 is merged.
- The current keyboard schema is at migration 0016.
- `GET /agent-lab/keyboard/enter?fresh=...` creates a fresh keyboard chain/message/root choice capability.
- Character menus are minimal native hyperlinks for lowercase `a-z`, `space`, and `done`.
- Each successful character choice consumes the current choice capability and issues one fresh successor with explicit predecessor linkage.
- `done` completes a message and issues a read capability.
- A successful read currently returns the exact value plus one native `continue` link.
- `/agent-lab/keyboard/continue` currently creates another empty message with incremented `message_index` **on the same keyboard `chain_id`**.
- Current capabilities support `choose`, `read`, and `continue`.
- Current events support `enter`, `choose`, `complete`, `read`, and `continue`.
- Action capabilities use 24-hour expiry, single-use replay protection, hash-only persistence, atomic transitions, and explicit predecessor linkage.
- The current `chain_id` therefore spans several messages. That deployed representation is migration input; it is not the target semantic model after this slice.
- Slice 1 `/agent-lab/enter -> write -> read` remains separate and unchanged.
- Ordinary Loom auth/project/document behavior must remain unchanged.

Do not reimplement the keyboard from scratch.

## Exact implementation scope

### 1. Make one keyboard chain mean one message chain

After this slice, one `agent_lab_keyboard_chains` row represents one character/message chain and owns exactly one keyboard message.

A completed message chain is immutable. Starting another message always creates a new message chain.

Refine the 0016 schema accordingly:

- restore/enforce one message per message chain;
- the old cross-message `message_index` is no longer the cross-message ordering mechanism;
- capability predecessor linkage may legitimately cross message-chain IDs;
- a capability bound to a message chain must consistently reference that chain/message.

Add a new migration, expected to be `migrations/0017_agent_lab_author_reentry.sql`.

#### Migration of existing 0016 data

Test and support upgrade from a populated 0016 database.

For each legacy multi-message keyboard chain:

- preserve the existing chain ID for its first message where practical;
- assign deterministic collision-safe new message-chain IDs to later messages;
- preserve all message IDs, values, symbol counts, completion timestamps, creation timestamps;
- update capability/message-chain bindings consistently while preserving capability IDs, token hashes, predecessor links, expiry/consumption state, and timestamps;
- preserve event IDs, outcomes, and timestamps while making post-migration relation semantics reconstructable;
- create one author chain representing the already-proven legacy continuation sequence and add the split message chains in former `message_index` order.

For a legacy chain containing only one message:

- preserve it as one message chain;
- do not invent an author chain merely because the old chain row existed.

Do not discard production experiment history to simplify the migration. Use D1-compatible migration patterns and run `PRAGMA foreign_key_check` in regression coverage.

### 2. Add author-chain persistence

Add an explicit author-chain model separate from message chains.

It must support:

- stable opaque author-chain IDs;
- ordered member message chains with a 1-based author-member index;
- uniqueness of `(author_chain_id, author_index)`;
- at most one author-chain membership for one message chain in this experiment;
- creation and append operations that are safe under replay/concurrency.

Do not add thread-chain persistence in this slice.

### 3. Turn successful read into a two-choice junction

Keep the successful read response as minimal HTML containing the exact stored value in escaped text.

After consuming the read capability, issue one fresh single-use continuation decision capability C.

The read page must contain exactly two native action anchors:

- `next message`;
- `preserve author continuity`.

Both anchors use the **same raw C**, differing only by server-defined route/action. The first successful action consumes C; the sibling then rejects as replayed/consumed and must not create another successor.

Do not issue a durable re-entry capability merely by reading. Preservation is an explicit action.

A suitable conceptual response is:

```html
<!doctype html>
<meta charset="utf-8">
<pre id="value">oranges</pre>
<a href="https://<origin>/agent-lab/keyboard/continue?cap=C">next message</a>
<a href="https://<origin>/agent-lab/keyboard/preserve?cap=C">preserve author continuity</a>
```

Keep absolute hrefs, HTML escaping, `Cache-Control: no-store`, no forms/buttons/scripts/redirects/cookies/custom headers.

### 4. Refine immediate continuation

`GET /agent-lab/keyboard/continue?cap=C`

still supports seamless immediate continuation, but it must no longer create message 2 on the same message chain.

A successful immediate continuation must atomically:

1. validate and consume C;
2. ensure the completed source message chain belongs to an author chain, creating an author chain and source membership if this is the first proven cross-message continuity;
3. create a fresh message chain with a fresh empty message;
4. append that new message chain to the same author chain at the next author-member index;
5. issue a root `choose` capability for the new message chain with C as explicit predecessor;
6. record safe transition telemetry;
7. return the ordinary 28-link keyboard.

Concurrent/replayed use of C must not create duplicate author memberships, multiple author chains for the source, or multiple next message chains.

### 5. Add explicit preserve/exit action

Add:

`GET /agent-lab/keyboard/preserve?cap=C`

This route consumes the same kind of post-read continuation decision capability C used by `continue`.

A successful preserve must atomically:

1. validate and consume C;
2. ensure the completed source message chain belongs to an author chain, creating one and adding the source if needed;
3. issue one fresh opaque **re-entry capability R** narrowly bound to that author chain and this exit boundary;
4. record explicit predecessor lineage C -> R;
5. persist only a one-way hash of R;
6. return a minimal HTML page exposing the complete absolute re-entry URL both as visible text and as a native hyperlink.

There is one new R for each exit/entry pair.

R is not an ordinary reusable session token. It is **single-use** and becomes dead after successful re-entry.

For this experiment, do not apply the ordinary 24-hour action-capability expiry to R. Model it so an unused R can survive a later conversation/execution boundary without automatic short expiry, while still supporting explicit revocation and replay detection. Do not weaken expiry semantics for normal choose/read/continue capabilities.

A suitable conceptual response is:

```html
<!doctype html>
<meta charset="utf-8">
<pre id="reentry-url">https://<origin>/agent-lab/keyboard/reenter?cap=R</pre>
<a href="https://<origin>/agent-lab/keyboard/reenter?cap=R">re-enter author chain</a>
```

Do not persist the raw URL/token.

### 6. Add re-entry

Add:

`GET /agent-lab/keyboard/reenter?cap=R`

A successful re-entry must atomically:

1. validate R, including expected operation, hash lookup, author-chain binding, revocation state, and replay state;
2. consume R exactly once;
3. create a fresh message chain and empty message;
4. append that new message chain to R's bound author chain at the next author-member index;
5. issue the new message chain's root `choose` capability with R as explicit predecessor;
6. record safe re-entry telemetry;
7. return the ordinary 28-link keyboard.

Re-entry never reopens the completed exit message.

Malformed, unknown, revoked, or replayed R must reject without silently creating a fresh entrance or new author chain.

After the re-entered message is completed and read, a later preserve action must issue a distinct R2. Replaying R1 remains invalid.

### 7. Capability and telemetry model

Extend the keyboard capability/event model as needed for:

- re-entry capability operation;
- preserve event;
- re-entry event;
- explicit author-chain binding for the re-entry handoff;
- predecessor lineage across message-chain boundaries.

Preserve these invariants:

- recoverable raw capabilities are never persisted;
- one successful predecessor transition produces at most one successor in this protocol;
- sibling post-read actions share C and race safely;
- successful mutation + capability consumption + required successor/membership creation is atomic;
- caller-controlled arbitrary IDs are not written into rejection telemetry unless resolved to authoritative objects.

It must be possible to reconstruct safe transition history without duplicating arbitrary message content in event rows.

### 8. Add public read-only completed-message index

Add:

`GET /agent-lab/keyboard/index`

The index is public experimental output and lists completed message chains only, newest completion first.

For each listed entry expose, in escaped text:

- exact completed message value;
- completion time;
- stable message-chain ID;
- author-chain ID/link when present;
- a stable read-only message-detail link.

Add a stable read-only detail route for one message chain. Also add a stable read-only author-chain page that lists its member message chains in author order.

Exact route spellings may follow existing routing conventions, but keep them simple GET pages under `/agent-lab/keyboard/`.

Keep the first index page bounded to at most 100 completed entries. Pagination/search are not required in this slice.

Historical completed keyboard messages migrated from 0016 must appear.

Index/detail/author pages must never expose:

- raw capabilities or re-entry URLs;
- capability hashes;
- IP/user-agent/request-header data;
- rejection telemetry;
- ordinary Loom secrets.

Stored message text is untrusted data: escape it and render it as text only, not Markdown/HTML and not automatically linkified.

### 9. Keep the fresh entrance non-authoritative

A fresh entrance still creates only a fresh message chain and root choice capability.

It must not:

- create or select an author chain;
- accept an author-chain ID as proof;
- infer returning authorship from cookies, IP, user-agent, timing, content similarity, or other ambient state;
- fall back from failed re-entry into a fresh author chain.

This distinction is an acceptance requirement, not merely documentation wording.

### 10. Tests

Add/adjust focused automated coverage proving at minimum:

- fresh entrance creates one message chain and no author-chain membership;
- one message chain owns only one message after migration;
- populated 0016 multi-message history migrates into separate message chains without losing IDs/content/capability lineage/history;
- migrated legacy multi-message sequences become one ordered author chain;
- single-message legacy chains do not gain invented author continuity;
- successful read returns exact value plus exactly two native junction links sharing one C;
- choosing `next message` consumes C, invalidates `preserve`, creates a new message chain, and links source+target in one author chain;
- choosing `preserve` consumes C, invalidates `continue`, creates/uses the source author chain, and issues exactly one hash-only re-entry capability;
- the preserve response exposes one absolute re-entry URL as visible text and a native anchor;
- R survives beyond the ordinary 24-hour action-capability lifetime in testable semantics, while choose/read/continue expiry remains unchanged;
- re-entry consumes R once, creates exactly one new message chain in the same author chain, and issues a root choose capability with predecessor R;
- concurrent/replayed C or R cannot fork author membership or message creation;
- R1 replay fails after use;
- a later preserve produces distinct R2;
- invalid/revoked re-entry rejects without fallback;
- index shows completed historical/current messages, newest first, and excludes incomplete messages;
- index/detail/author pages escape stored content and contain no capability material;
- author page order follows author-member index;
- existing 128-symbol behavior, fresh entrance behavior, Slice 1 behavior, and unrelated Loom auth remain intact.

### 11. Required checks

Run:

- `npm test`
- `npm run typecheck`
- `git diff --check`

If the local Codex environment cannot install dependencies or reach the registry, report that precisely and still perform all checks available locally. GitHub Actions remains the authoritative CI fallback.

## Manual acceptance experiment after deploy

The implementation should support this exact black-box experiment:

1. Use a never-before-used fresh entrance URL.
2. Write `oranges`, choose `done`, and read it.
3. Choose **preserve author continuity** and retain the returned re-entry URL.
4. End that agent/chat turn.
5. In a later turn, visit the re-entry URL.
6. Write `apple`, choose `done`, and read it.
7. Verify the index shows two distinct message-chain IDs for `oranges` and `apple`, both in the same author chain.
8. Verify replaying the first re-entry URL fails.
9. Preserve again after `apple` and verify the newly issued R2 differs from the consumed R1.

A separate fresh entrance must produce an unrelated message chain with no author-chain association until explicit continuity is established.

## Documentation

Keep `docs/AGENT_LAB_RELATION_CHAINS.md` authoritative for message-chain / capability-chain / author-chain / future thread-chain semantics.

Update `docs/AGENT_CAPABILITY_CONTINUITY.md` only if implementation details force a clarification beyond the already-added refinement note.

If route names or exact persistence choices differ from the conceptual names above, update the durable doc in the same PR so code and architecture remain aligned.

## Explicit non-goals

Do not add:

- thread-chain implementation;
- autocomplete, word/phrase prediction, or dictionary completion;
- cursor movement, arbitrary-position editing, backspace/delete/replace, or the proposed hyperlink text editor;
- LLM SEO, search-engine indexing strategy, discovery bait, sitemap or `llms.txt` changes;
- search-query/referrer state injection experiments;
- participant identity, accounts, or ordinary Loom agent auth;
- project/document access;
- a generic permissions system or arbitrary author metadata bag;
- JavaScript, forms, redirects, cookies, or alternate interaction transports;
- mutation/reopening of completed message chains;
- generalized GET mutation outside Agent Lab.

Keep this slice focused on explicit author continuity across message-chain boundaries plus safe visibility of completed entries.
