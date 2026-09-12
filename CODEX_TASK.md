# Current Codex Task

Implement the next Agent Lab keyboard slice: make external keyboard runs start from a unique entrance address and make the keyboard capability chain continue across multiple completed messages.

Read and follow `AGENTS.md`, `docs/TESTING_MODEL.md`, `docs/AGENT_GET_CAPABILITY_EXPERIMENT.md`, `docs/AGENT_CAPABILITY_CONTINUITY.md`, and the current implementation/tests. Treat the repository as the source of truth.

## Goal

Two production observations/design decisions now belong in one bounded implementation slice:

1. External Slice 2b testing showed that reusing the stable keyboard entrance URL can result in an old entrance response/capability being reused by an external retrieval layer. Production telemetry classified the observed failure as `replayed`, not `expired`, and tied it to a prior completed chain. Controlled external runs therefore need a never-before-used entrance URL while preserving the same fresh-chain semantics.
2. A completed keyboard message must not terminate attributable capability continuity. After a successful read, Loom should issue a fresh continuation capability. Following that continuation creates a new empty keyboard message on the same chain and returns a new character menu.

The target lifecycle is:

`fresh enter -> choose* -> done -> read -> continue -> choose* -> done -> read -> continue -> ...`

`done` completes one message. It does not complete the capability chain.

Autocomplete remains explicitly out of scope.

## Current relevant behavior

Verify these points against `main` before editing:

- Slice 1 `/agent-lab/enter -> write -> read` exists separately and must remain unchanged.
- The keyboard routes currently include:
  - `GET /agent-lab/keyboard/enter`
  - `GET /agent-lab/keyboard/choose?cap=<capability>&choice=<choice>`
  - `GET /agent-lab/keyboard/read?cap=<read-capability>&id=<message-id>`
- Keyboard menus are minimal HTML native hyperlinks.
- The keyboard alphabet is exactly lowercase `a-z`, `space`, and `done`.
- One menu uses one shared single-use choice capability across all 28 choices.
- A successful letter/space choice consumes the current capability, persists one symbol, and issues one fresh successor choice capability.
- `done` completes the current message and issues one fresh read capability.
- The current read consumes the read capability, returns the exact completed value as plain text, and terminates.
- `agent_lab_keyboard_messages.chain_id` is currently unique, so the schema permits only one message per chain.
- Keyboard capabilities currently permit only `choose` and `read`.
- Keyboard events currently permit `enter`, `choose`, `complete`, and `read`.
- The current schema does not record explicit predecessor-capability linkage.
- All Agent Lab responses use `Cache-Control: no-store`.
- Existing capability hashing, 24-hour expiry, replay protection, 128-symbol limit, safe rejection classification, raw-capability non-persistence, and auth isolation must remain intact.

Do not reimplement the keyboard from scratch.

## Exact implementation scope

### 1. Support unique entrance addresses without changing entrance authority

The existing handler for:

`GET /agent-lab/keyboard/enter`

must also accept a unique-address variant such as:

`GET /agent-lab/keyboard/enter?fresh=<opaque-value>`

The `fresh` value exists only to make the initial retrieval URL unique for controlled external-agent runs.

Requirements:

- every successful entrance request still creates a brand-new keyboard chain, message 1, and root choice capability;
- the `fresh` value grants no authority;
- it is not a bearer capability;
- it must not be copied into successor action URLs;
- it need not be persisted;
- it must not affect capability hashing, chain identity, or message identity;
- the stable entrance without `fresh` remains supported for compatibility/human testing;
- all entrance responses remain `Cache-Control: no-store`.

Do not add independent cache-buster parameters to ordinary successor choose/read/continue URLs.

Use a bounded, non-dangerous query value. If validation is useful, keep it simple and do not turn freshness into another authentication concept.

### 2. Allow multiple ordered messages per keyboard chain

Add a migration, expected to be `migrations/0016_agent_lab_keyboard_continuity.sql`.

The post-migration message model must:

- allow more than one message for one `chain_id`;
- add a stable 1-based `message_index`;
- enforce uniqueness of `(chain_id, message_index)`;
- preserve one-chain ownership for each message;
- preserve existing IDs, values, symbol counts, completion timestamps, and creation timestamps.

For pre-existing keyboard data:

- every existing message becomes `message_index = 1` for its existing chain;
- do not regenerate IDs or contents;
- do not drop historical chains/events/capabilities.

Use a safe SQLite/D1 migration pattern. Test upgrade from populated 0015 state, not only fresh initialization.

### 3. Record explicit capability predecessor lineage

Extend keyboard capability persistence with a nullable predecessor reference, e.g. `predecessor_capability_id`, referencing `agent_lab_keyboard_capabilities(id)`.

Semantics:

- root choice capability created by entrance: predecessor is null;
- every post-migration successor capability created by consuming another capability records that consumed capability's ID as predecessor;
- existing historical capability rows may retain null predecessor because the old schema did not record issuance edges;
- one successful predecessor may issue at most one successor in this protocol;
- raw capability values remain hashed/non-recoverable exactly as before.

Add an appropriate uniqueness constraint/index if needed to enforce that one predecessor cannot issue multiple successors. Preserve compatibility with historical nulls.

### 4. Add a continuation capability operation

Extend keyboard capability operations with:

`continue`

and keyboard event operations with:

`continue`.

Add a new route:

`GET /agent-lab/keyboard/continue?cap=<continuation-capability>`

Wire it through the same narrow Agent Lab auth bypass as the existing keyboard routes. Unrelated Loom routes remain protected.

A continuation capability is issued only by a successful keyboard read and is bound to the same chain and the message that was just read.

### 5. Make successful read issue a continuation capability

Change:

`GET /agent-lab/keyboard/read?cap=R&id=<message-id>`

so a successful request atomically:

1. validates the read capability, chain, authoritative message binding, supplied message ID, expected operation, expiry, replay state, and completed-message state;
2. consumes R exactly once;
3. issues one fresh single-use `continue` capability C on the same chain, bound to the same completed message;
4. records predecessor linkage R -> C;
5. records the allowed read event;
6. returns the exact persisted value plus exactly one native `continue` hyperlink carrying C.

Successful read is therefore now minimal `text/html; charset=utf-8`, not terminal plain text.

Use a simple representation compatible with the architecture document, for example:

```html
<!doctype html>
<meta charset="utf-8">
<pre id="value">pebble</pre>
<a href="https://<origin>/agent-lab/keyboard/continue?cap=...">continue</a>
```

Requirements:

- `pre#value` represents the exact stored lowercase/space value after HTML decoding;
- dynamic text/attributes are escaped safely;
- exactly one actionable anchor is present;
- the href is absolute;
- no forms, buttons, scripts, redirects, cookies, custom headers, or JavaScript;
- `Cache-Control: no-store` remains;
- read rejections remain plain text and issue no successor;
- replaying the consumed read capability must not issue another continuation capability.

### 6. Implement continuation into a new message

A successful:

`GET /agent-lab/keyboard/continue?cap=C`

must atomically:

1. validate C as a live unconsumed `continue` capability bound to a completed prior message;
2. consume C exactly once;
3. create one new empty message on the same chain with `message_index = prior.message_index + 1`;
4. issue one fresh `choose` capability bound to the new message;
5. record predecessor linkage C -> new choice capability;
6. record an allowed `continue` event associated with the newly created message or otherwise in a way that makes prior and next state reconstructable from authoritative stored linkage;
7. return the ordinary empty 28-link keyboard menu.

The previous message must remain immutable and completed.

Replayed or concurrent continuation attempts using the same capability must not create multiple messages or multiple successor choice capabilities.

Continuation rejection responses remain simple `text/plain; charset=utf-8`, `Cache-Control: no-store`, and issue no successor.

Do not silently create a new root if continuation is missing/invalid. New roots are created only by an explicit entrance request.

### 7. Populate predecessor linkage for all new keyboard transitions

After the migration, all newly issued keyboard successor capabilities must populate predecessor linkage:

- choice -> successor choice;
- `done` choice -> read;
- read -> continue;
- continue -> new-message choice.

The entrance root choice remains predecessor-null.

Do not attempt to infer predecessor IDs for historical rows.

### 8. Preserve existing keyboard semantics

Do not change:

- keyboard alphabet/order;
- shared-capability sibling behavior;
- capability token format/prefix unless the existing format already supports the new operation without change;
- 24-hour expiry;
- 128-symbol per-message limit;
- empty-message `done`;
- exact lowercase/space persistence;
- raw-capability hashing/non-persistence;
- caller-supplied read-ID telemetry protections;
- ordinary auth isolation;
- discovery posture;
- Slice 1 semantics.

### 9. Keep fresh entrance and continuity conceptually separate

The entrance `fresh` value solves initial retrieval-address reuse only.

It must not become:

- the chain ID;
- a capability;
- a cookie/session;
- a predecessor marker;
- a value propagated into later action URLs.

Once entrance succeeds, normal capability rotation provides state-specific successor URLs.

## Migration and test-fixture requirements

Update test migration setup so the new migration is applied in normal test initialization.

Also add/extend a historical migration fixture that represents a populated schema through 0015 and then applies 0016.

The migration test must prove preservation of at least:

- existing keyboard chain ID;
- existing message ID/value/symbol_count/completed_at/created_at;
- existing capability IDs/token hashes/expected operations/consumption state;
- existing event IDs/operations/outcomes/timestamps;
- foreign-key integrity after migration;
- existing message becomes index 1;
- new post-migration continuation behavior can proceed from valid newly created state.

Do not reset the database or discard experimental history.

## Required behavioral tests

At minimum prove:

1. Two requests using two different `?fresh=...` entrance URLs each create distinct fresh chains/root capabilities.
2. The `fresh` value does not appear in returned choose hrefs or capability/event persistence.
3. Stable entrance without `fresh` still works.
4. Entrance creates message index 1 and a predecessor-null root choice capability.
5. Existing 28-link menu behavior remains unchanged.
6. Character selection persists partial text and successor choice capabilities record predecessor IDs.
7. Consumed sibling choices still cannot fork the chain.
8. `done` completes only the current message and its read successor records the final choice as predecessor.
9. Successful read returns HTML containing exact decoded value plus exactly one `continue` anchor.
10. The continuation capability is fresh, single-use, expected operation `continue`, same chain, bound to the message just read, and records the read capability as predecessor.
11. Replaying read does not issue a second continuation capability.
12. Following the returned `continue` href creates exactly one empty message index 2 on the same chain and returns the ordinary 28-link keyboard.
13. The new message's root choice capability records the continuation capability as predecessor.
14. The completed message 1 remains unchanged after continuation and typing in message 2.
15. A second full cycle can complete/read message 2 and continue to message 3, proving the model is recursive rather than hard-coded to two messages.
16. Empty-message completion/read/continue works.
17. Concurrent uses of one continuation capability produce exactly one successful next-message creation and no fork.
18. Malformed, unknown, expired, replayed, wrong-operation, wrong-chain/wrong-message, and wrong-state continuation attempts reject without successors or new messages.
19. The per-message 128-symbol bound remains intact and does not bleed across messages.
20. Rejection responses remain plain text/no-store.
21. Successful entrance/menu/done/read/continue HTML contains no forms, buttons, scripts, redirects, or JavaScript action mechanisms.
22. Raw capabilities never appear in database rows or events.
23. Caller-controlled IDs are not copied into rejection telemetry without authoritative resolution.
24. Existing Slice 1 tests remain green unchanged.
25. Unrelated protected Loom routes remain protected.
26. `PRAGMA foreign_key_check` remains clean.

Model these as operation/state transitions in the spirit of `docs/TESTING_MODEL.md`, not merely helper-function tests.

## Acceptance smoke

Use a non-production environment and follow the actual returned hyperlinks.

Run this path:

`fresh enter -> p -> e -> b -> b -> l -> e -> done -> read -> continue -> l -> o -> o -> m -> done -> read`

Verify:

- first read value is exactly `pebble`;
- first read exposes exactly one `continue` hyperlink;
- continue keeps the same chain but creates message index 2;
- second read value is exactly `loom`;
- message 1 remains `pebble`;
- capability lineage is reconstructable through stored predecessor IDs;
- at least one consumed sibling/replay attempt is rejected without creating an extra successor/message.

Do not use production for Codex testing.

## Required checks

Run where the environment permits:

```text
npm test
npm run typecheck
git diff --check
```

Run the smallest available non-production functional smoke described above.

If dependency installation is blocked by registry/network restrictions, report that exactly. Do not weaken dependency/security configuration to compensate. GitHub Actions remains an independent baseline verification layer.

## Documentation

The durable architecture already exists in:

- `docs/AGENT_GET_CAPABILITY_EXPERIMENT.md`
- `docs/AGENT_CAPABILITY_CONTINUITY.md`

Keep implementation aligned with those documents.

If implementation reveals a genuine architectural ambiguity, stop and report it rather than silently inventing a new lifecycle rule.

Update documentation only where necessary to reflect the implemented route/representation precisely. Do not rewrite historical observations as though they had always been the behavior.

## Explicit non-goals

Do not add:

- autocomplete, word/phrase suggestions, dictionary completion, predictive text, or larger action alphabets;
- uppercase, digits, punctuation, Unicode input, backspace/delete, cursor movement, or editing;
- arbitrary free-form text/query submission;
- participant or durable real-world agent identity;
- project/document access;
- discovery/indexing, crawler bait, `llms.txt`, sitemap, or normal Loom UI exposure;
- cookies or ambient session inference;
- reusable long-lived bearer tokens;
- branching/fan-out capability semantics;
- buttons, forms, JavaScript controls, POST transport, redirects, or alternate interaction primitives;
- independent cache-busters on successor action URLs;
- generalized GET mutation outside the isolated Agent Lab;
- changes to ordinary machine authentication/authorization;
- unrelated refactors or cleanup.

Keep this slice bounded to **fresh external entry + continuous, explicitly attributable keyboard capability lineage across multiple messages**.
