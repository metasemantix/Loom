# Current Codex Task

Implement Slice 2, the recursive verbatim-link hop probe defined in `docs/AGENT_GET_CAPABILITY_EXPERIMENT.md`.

Read and follow `AGENTS.md`, `docs/TESTING_MODEL.md`, `docs/AGENT_GET_CAPABILITY_EXPERIMENT.md`, and `docs/AGENT_ACCESS.md`. Treat the current repository as source of truth and preserve the already deployed Slice 1 `/agent-lab/enter -> write -> read` behavior.

## Goal

Answer one narrow empirical prerequisite before implementing any hyperlink keyboard or compositional writing mechanism:

Can an ordinary retrieval-oriented agent recursively follow a newly generated URL when every next URL appears verbatim and completely in the immediately preceding response?

Build the smallest deployable hop chain needed to test that question.

## Current relevant behavior

Verify against the repository before editing:

- Slice 1 is implemented under `/agent-lab` with dedicated D1 tables, hashed single-use capabilities, 24-hour expiry, append-only events, plain-text/no-store responses, and anonymous lab routing isolated from ordinary Loom authorization.
- `src/agent-lab.ts` currently implements the Slice 1 enter/write/read handlers.
- migration `0014_agent_get_capability_experiment.sql` created the current lab tables and restricts capability expected operations and event operation values to the Slice 1 taxonomy.
- ordinary authenticated machine access remains governed by `docs/AGENT_ACCESS.md`.
- CI runs `npm test`, `npm run typecheck`, and `git diff --check`.

Do not regress Slice 1 while adding Slice 2.

## Exact implementation scope

### 1. Add the hop routes

Implement:

- `GET /agent-lab/hop/enter`
- `GET /agent-lab/hop?cap=<capability>`

Keep implementation focused in the existing agent-lab module or a very small adjacent experimental module.

The hop routes must use the same narrowly isolated anonymous routing treatment as existing `/agent-lab` routes and must not weaken authorization elsewhere.

### 2. Exact hop sequence

`/agent-lab/hop/enter` creates a fresh anonymous hop chain and capability A, then returns exactly one absolute directly usable URL:

```text
next: https://<request-origin>/agent-lab/hop?cap=A
```

Following A must atomically consume A, create B, and return exactly one literal successor URL containing B. Following B does the same for C.

Following C atomically consumes C and returns the terminal response:

```text
success: pebble-hop-complete
```

A final newline is allowed. The terminal response must contain no `next` URL and must issue no successor capability.

The required path is therefore exactly:

```text
enter -> A -> B -> C -> terminal
```

A successor must not exist before successful consumption of its predecessor. Do not pre-generate the whole chain at entrance.

### 3. Verbatim-link invariant

This is the reason the slice exists.

Every nonterminal response must contain exactly one complete, absolute, directly followable `next` URL. The caller must never need to:

- append text;
- replace a placeholder;
- interpolate a value;
- copy a token into another URL;
- construct a query string;
- submit JSON, a form, custom headers, or cookies.

Do not add redirects or alternate transports. We want to know whether a fresh response can itself authorize the next previously unseen literal URL in the external agent environment.

### 4. Capability semantics

Reuse the existing lab capability model and security properties:

- cryptographically secure high-entropy opaque token;
- raw token never persisted;
- one-way hash persisted for lookup;
- bound to one chain and expected hop operation;
- 24-hour expiry;
- successful consumption at most once;
- consumption and successor creation atomic so replay/concurrency cannot fork the chain;
- malformed, unknown, expired, replayed, and wrong-operation use rejected without successor.

Do not weaken Slice 1 capability behavior.

If the existing `0014` CHECK constraints cannot represent the hop operation/event taxonomy, add the next repository migration rather than editing historical migration 0014. Inspect current migration numbering first; if main is still through 0014, use `0015_agent_lab_hop_probe.sql`. Preserve all existing experimental rows during upgrade.

### 5. Persistence and observability

Use the existing isolated experimental persistence where it fits cleanly. Add only the smallest schema extension/rebuild required for hop operation/depth.

Record append-only events sufficient to reconstruct:

- hop chain entrance;
- successful A, B, C consumption;
- terminal completion;
- rejected attempts and their safe outcome classification.

Do not persist raw capabilities. This slice has no arbitrary message payload and must not create or mutate Slice 1 scratch entries.

The implementation needs a reliable server-side way to know whether a capability is A, B, or C / which hop depth comes next. Prefer the smallest explicit persisted representation that preserves atomicity and makes tests unambiguous; do not infer depth from token contents.

### 6. HTTP behavior

All hop responses, successful or rejected, must preserve the lab's primitive behavior:

- `text/plain; charset=utf-8`;
- `Cache-Control: no-store`;
- simple errors without hashes/internal state/token-oracle detail.

Nonterminal success: exactly one `next` URL.
Terminal success: `success: pebble-hop-complete` and no successor.

### 7. Preserve experiment isolation

Do not advertise the hop probe in `llms.txt`, sitemaps, normal Loom UI, project manifests, crawler metadata, or ordinary agent discovery surfaces.

The operator will explicitly supply `/agent-lab/hop/enter` to a fresh external chat.

## Required tests

Add focused integration coverage proving at minimum:

1. `/agent-lab/hop/enter` creates a fresh chain and returns exactly one complete absolute `next` URL containing A.
2. A did not exist before entrance; B does not exist before successful A consumption; C does not exist before successful B consumption.
3. the exact successful path is `enter -> A -> B -> C -> terminal`.
4. A response contains exactly one literal B URL and B response exactly one literal C URL; no URL editing/interpolation is required.
5. C returns exactly `success: pebble-hop-complete` with optional final newline, no `next` URL, and no successor capability.
6. replaying A cannot create another B or advance the chain.
7. replaying B cannot create another C or advance the chain.
8. replaying C cannot produce another successful terminal transition or successor.
9. malformed/unknown/expired hop capabilities are rejected without successors.
10. a Slice 1 write/read capability cannot be used as a hop capability, and a hop capability cannot be used for Slice 1 write/read.
11. raw A/B/C capability values are absent from persistence/event rows.
12. concurrent consumption cannot fork B/C where the test environment can exercise this reliably.
13. hop success/error responses are plain text and `Cache-Control: no-store`.
14. existing Slice 1 tests continue to pass unchanged in semantics.
15. unrelated protected Loom routes remain protected.

Use direct D1 inspection where useful to prove successor timing, single-use behavior, and absence of raw tokens rather than inferring all invariants from response text.

## Migration verification

If a migration is needed, follow `AGENTS.md` migration rules and verify both:

- fresh database applying all migrations through the new migration;
- existing database through 0014 upgraded through the new migration without resetting or losing Slice 1 lab rows or ordinary Loom data.

Do not edit historical migrations.

## Acceptance criteria

The slice is complete when:

- the two hop routes implement exactly `enter -> A -> B -> C -> terminal`;
- each nonterminal successor is created only after successful predecessor consumption;
- each nonterminal response contains one complete literal absolute next URL requiring no modification;
- capabilities remain hashed, one-use, expiring, operation-bound, and atomically consumed;
- terminal C consumption produces `success: pebble-hop-complete` and no successor;
- the probe remains isolated and undiscoverable through existing Loom surfaces;
- Slice 1 behavior and ordinary authorization remain unchanged;
- required tests and baseline checks pass.

## Required checks

Run where the environment permits:

```text
npm test
npm run typecheck
git diff --check
```

Also perform the smallest non-production functional smoke available: request hop entrance, follow A, then B, then C, verify the terminal marker, then verify replay rejection. Do not use production for Codex testing.

If Codex cannot install dependencies because of registry/network restrictions, report that exactly and do not alter dependencies or security settings to compensate. GitHub Actions remains the independent baseline verification layer.

## Documentation

The durable Slice 2 contract is already recorded in `docs/AGENT_GET_CAPABILITY_EXPERIMENT.md`. Update it only if implementation exposes a necessary clarification; do not silently change the experimental question or settled semantics.

Do not fold the lab into `docs/AGENT_ACCESS.md`.

## Explicit non-goals

Do not implement:

- alphabet/link keyboard;
- arbitrary/compositional message writing;
- hop mutation of scratch entries;
- discovery, crawler bait, or `llms.txt` changes;
- redirects or alternate-host workarounds;
- shell/curl-specific behavior;
- UI;
- project/document access;
- participant/agent identity;
- work-for-access, credits, reputation, quotas;
- agent messaging/coordination;
- generalized GET mutation outside `/agent-lab`;
- ordinary machine-auth changes;
- deployment automation;
- unrelated refactors.

Keep this tiny. Its value is the empirical answer, including if the external chat fails at the second hop.