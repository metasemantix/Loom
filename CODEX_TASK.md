# Current Codex Task

Implement Slice 2, the verbatim-link compositional keyboard defined in `docs/AGENT_GET_CAPABILITY_EXPERIMENT.md`.

Read and follow `AGENTS.md`, `docs/TESTING_MODEL.md`, the normative experiment specification in `docs/AGENT_GET_CAPABILITY_EXPERIMENT.md`, and `docs/AGENT_ACCESS.md`. Treat the current repository as source of truth. Preserve the already deployed Slice 1 `/agent-lab/enter -> write -> read` behavior.

## Goal

Build the smallest deployable server-provided hyperlink keyboard that lets an external retrieval-oriented agent compose persistent text without ever constructing or editing a URL.

The server supplies exactly 28 literal choices (`a-z`, `space`, `done`) on every keyboard turn. All choices in one menu share one single-use capability. The agent selects a sequence; each successful symbol choice is persisted immediately and produces a fresh capability plus a fresh complete menu.

This task replaces the previously prepared standalone recursive-hop probe. Do not implement `/agent-lab/hop`. The keyboard itself tests recursive following of newly generated literal URLs while also testing compositional state externalization.

## Current relevant behavior

Verify these points against the repository before editing:

- Slice 1 is deployed under `/agent-lab` and implemented in `src/agent-lab.ts`.
- Slice 1 uses dedicated `agent_lab_chains`, `agent_lab_capabilities`, `agent_lab_entries`, and `agent_lab_events` tables from migration 0014.
- migration 0014 CHECK constraints currently admit only Slice 1 capability operations (`write`, `read`, `complete`) and event operations (`enter`, `write`, `read`).
- `agent_lab_entries.byte_count` requires 1..1024, so it cannot represent the keyboard's required initially empty message without weakening a Slice 1 invariant.
- lab routes are dispatched before ordinary principal resolution and remain narrowly anonymous/isolated.
- CI runs the baseline repository checks.

Do not edit historical migration 0014. Do not regress Slice 1.

## Exact implementation scope

### 1. Add dedicated keyboard persistence

Inspect current migration numbering. If main is still through 0014, add `migrations/0015_agent_lab_keyboard.sql`.

Prefer dedicated keyboard tables rather than rebuilding/weakening Slice 1 tables merely to accommodate empty mutable keyboard messages and new operation taxonomy.

Use the smallest schema that cleanly supports:

- a fresh anonymous keyboard chain/session;
- one persisted message row that begins as the empty string;
- current value and symbol count;
- incomplete/completed state;
- hashed single-use keyboard choice capabilities;
- hashed single-use final read capabilities, either in the same dedicated capability table or another minimal clean representation;
- append-only keyboard events sufficient for safe experiment reconstruction.

The authoritative message value must be stored after every successful symbol choice. An append-only per-keystroke table is optional, not required. Do not add one unless it materially simplifies atomic correctness.

Do not store raw capabilities. Do not duplicate the full evolving message into generic event rows.

### 2. Add keyboard routes

Implement exactly:

- `GET /agent-lab/keyboard/enter`
- `GET /agent-lab/keyboard/choose?cap=<capability>&choice=<choice>`
- `GET /agent-lab/keyboard/read?cap=<read-capability>&id=<message-id>`

Keep the code in `src/agent-lab.ts` or a focused adjacent module if that materially improves clarity.

Dispatch only these explicit routes anonymously before ordinary authentication. Do not create a broad `/agent-lab/*` authorization bypass that accidentally exposes future/unrecognized paths.

### 3. Exact menu contract

`/agent-lab/keyboard/enter` must:

1. create a fresh keyboard chain/session and an empty persisted message;
2. issue one high-entropy single-use choice capability A;
3. return the current empty value plus exactly 28 labeled complete absolute URLs: lowercase `a` through `z`, `space`, and `done`.

All 28 URLs in one menu must contain the same raw capability A. They differ only by the server-provided `choice` parameter.

Use a deterministic stable ordering: `a` through `z`, then `space`, then `done`.

Every URL must be complete and directly followable as printed. No placeholder substitution, URL editing, interpolation, form submission, JSON, custom header, cookie, redirect, or JavaScript may be required.

A menu should be mechanically easy to parse from plain text. A suitable shape is:

```text
value:
<current value>

a: https://<origin>/agent-lab/keyboard/choose?cap=A&choice=a
...
z: https://<origin>/agent-lab/keyboard/choose?cap=A&choice=z
space: https://<origin>/agent-lab/keyboard/choose?cap=A&choice=space
done: https://<origin>/agent-lab/keyboard/choose?cap=A&choice=done
```

The exact harmless whitespace may vary, but tests must establish the semantic invariants above.

### 4. Symbol choice semantics

For `choice=a` through `z` and `choice=space`, a valid request must atomically:

1. verify the capability is valid, unexpired, unconsumed, and bound to the keyboard message/chain and choice operation;
2. consume it exactly once;
3. append the selected lowercase letter, or one ASCII space for `space`, to the persisted message;
4. increment symbol count by one;
5. create exactly one fresh successor choice capability with a fresh 24-hour expiry;
6. record safe event metadata;
7. return the newly persisted value plus a new 28-link menu whose links all share that successor capability.

The protected mutation and successor issuance must be atomic enough that concurrent sibling-link requests cannot both mutate the message or fork successors. Do not implement check-then-act logic with a race window.

Because the 28 sibling links share one capability, the first successful choice invalidates the other 27.

### 5. Message length bound

Maximum message length is 128 symbols, where each accepted letter or `space` counts as one symbol.

At symbol count 128:

- another letter/space choice must be rejected;
- that rejection must **not consume** the current choice capability;
- it must issue no successor;
- the `done` sibling URL from the same current menu must remain usable.

The keyboard alphabet is ASCII-only, so this bound is intentionally symbol-based rather than a general UTF-8 content contract.

### 6. Done semantics

For `choice=done`, a valid request must atomically:

1. consume the current choice capability;
2. mark the keyboard message complete;
3. append no character and leave value/symbol count unchanged;
4. issue exactly one fresh single-use read capability R, bound to the same keyboard chain/message, with 24-hour expiry;
5. record safe event metadata;
6. return exactly one complete absolute read URL containing R and the stable message ID.

Do not return another keyboard menu after `done`.

An empty message may be completed with `done`; this is useful for keeping protocol semantics simple and is not equivalent to Slice 1's nonempty scratch-value rule.

### 7. Final read semantics

`/agent-lab/keyboard/read?cap=R&id=<message-id>` must:

- require a valid unexpired unconsumed read capability bound to the same keyboard chain/message;
- require the message to be complete;
- atomically consume R;
- return the exact persisted message in plain text;
- issue no successor.

A suitable response is:

```text
value:
pebble
```

Replay must fail without another successful protected read transition.

### 8. Capability and error contract

Keyboard capabilities must preserve the security properties of Slice 1:

- cryptographically secure, high entropy, opaque;
- raw values never persisted;
- one-way hashes persisted for lookup/verification;
- operation/chain/message binding;
- 24-hour expiry from issuance;
- successful consumption at most once;
- no successor on malformed, unknown, expired, replayed, wrong-operation, or cross-chain/message rejection;
- rejection responses must not become a useful token oracle.

Use a distinct token prefix if useful for keeping keyboard validation and Slice 1 isolation obvious. Do not make tokens encode message text, symbol choice, or mutable state.

Invalid `choice` values outside exactly `a-z`, `space`, `done` must be rejected without consuming a valid capability.

### 9. HTTP contract

All keyboard success and rejection responses must use:

- `text/plain; charset=utf-8`;
- `Cache-Control: no-store`.

No redirects, HTML, forms, JS, JSON, cookies, custom headers, alternate hosts, or fallback transports.

### 10. Observability

Record enough append-only safe metadata to reconstruct:

- keyboard entrance;
- successful symbol transitions;
- completion;
- final read;
- rejected attempts and outcome class.

Do not store raw capabilities in events. Do not duplicate the entire evolving message into event rows. The keyboard message table is authoritative for content. Prefer metadata such as message ID, symbol count, operation, outcome, and timestamp.

### 11. Preserve isolation and discovery posture

Do not expose the keyboard in:

- `llms.txt`;
- sitemaps;
- normal Loom UI/pages;
- project/participant manifests;
- crawler metadata;
- ordinary agent discovery surfaces.

Do not change `docs/AGENT_ACCESS.md` semantics. The keyboard is an isolated experiment, not ordinary Loom machine access.

## Required tests

Add focused integration tests proving at minimum:

1. keyboard entrance creates a fresh empty persisted message.
2. entrance response contains exactly 28 choices in deterministic `a-z`, `space`, `done` order and each is a complete absolute URL.
3. all 28 URLs in one menu share exactly one raw capability.
4. raw choice/read capabilities are absent from persistence and event rows.
5. selecting `p` persists `p`, consumes the old capability once, creates exactly one successor, and returns a fresh 28-link menu using it.
6. a multi-step deterministic path can compose `pebble` through six separately returned menus.
7. after each successful symbol, direct DB inspection sees the exact partial value (`p`, `pe`, `peb`, etc.) before the next choice is made.
8. a sibling URL from an already consumed menu cannot mutate the message or issue another successor.
9. `space` appends exactly one ASCII space.
10. invalid choices do not consume an otherwise valid current capability.
11. at 128 symbols, another symbol is rejected without consuming the capability and `done` with that same capability still succeeds.
12. `done` on a nonempty message consumes the current choice capability, leaves content/count unchanged, marks completion, issues exactly one read capability, and returns exactly one absolute read URL.
13. `done` on an empty fresh message is valid.
14. after completion, stale/sibling keyboard choices cannot mutate the message.
15. final read returns the exact completed value and consumes R once; replay is rejected.
16. malformed, unknown, expired, replayed, wrong-operation, and cross-message/cross-chain capabilities issue no successor.
17. concurrent sibling choices cannot fork the message/successor where Miniflare/D1 test behavior permits reliable exercise.
18. all keyboard responses are plain text and `Cache-Control: no-store`.
19. existing Slice 1 tests remain green with unchanged semantics.
20. unrelated protected Loom routes remain protected.

Tests should parse URLs from actual response text and follow those exact URLs rather than reconstructing equivalent request URLs in test code wherever practical. This keeps the test aligned with the external-agent experiment.

## Migration verification

Follow `AGENTS.md` migration rules. Verify both:

- a fresh database applying all migrations through the new keyboard migration;
- an existing database through 0014 upgraded through the new migration without resetting or losing Slice 1 lab rows or ordinary Loom data.

Do not edit historical migrations.

## Acceptance criteria

The task is complete when:

- a caller can enter the keyboard and receive 28 literal choices backed by one single-use capability;
- successive server-returned menus can compose and persist `pebble` one symbol at a time;
- every successful symbol is durable before the next menu is used;
- sibling choices cannot fork state;
- `done` converts the current choice capability into one final read capability without modifying content;
- the final literal read URL returns exactly the completed value once;
- 128-symbol and capability security invariants hold;
- raw tokens are never persisted;
- the keyboard remains isolated from ordinary Loom data/auth/discovery;
- Slice 1 remains intact;
- required tests and baseline checks pass.

## Required checks

Run where the environment permits:

```text
npm test
npm run typecheck
git diff --check
```

Also perform the smallest non-production functional smoke available using URLs parsed from responses: keyboard enter -> `p` -> `e` -> `b` -> `b` -> `l` -> `e` -> `done` -> read, and verify exact `pebble` readback plus rejection of at least one consumed sibling capability.

Do not use production for Codex testing.

If Codex cannot install dependencies because of registry/network restrictions, report that exactly and do not alter dependencies or security settings to compensate. GitHub Actions remains the independent baseline verification layer.

## Documentation

`docs/AGENT_GET_CAPABILITY_EXPERIMENT.md` is the durable source of truth and has already been updated for this Slice 2 design. Update it only if implementation exposes a necessary clarification; do not silently change the experimental question or settled semantics.

Do not implement the superseded standalone hop probe.

## Explicit non-goals

Do not implement:

- `/agent-lab/hop` or any separate recursive-hop protocol;
- uppercase, digits, punctuation, Unicode input, backspace/delete, cursor movement, editing, or arbitrary free-form query input;
- discovery, crawler bait, `llms.txt`, sitemap, or normal UI changes;
- redirects, alternate hosts, shell/curl-specific behavior, or fallback transports;
- project/document access;
- participant/agent identity;
- work-for-access, credits, reputation, quotas;
- agent messaging/coordination;
- generalized GET mutation outside `/agent-lab`;
- ordinary machine-auth changes;
- deployment automation;
- unrelated refactors or cleanup.

Keep this experimental slice small. The key empirical property is that Loom provides the alphabet and complete literal links while the external agent determines and persists the sequence.