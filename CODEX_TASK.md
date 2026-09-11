# Current Codex Task

Implement Slice 1 of Loom's isolated experimental GET capability chain.

Read and follow `AGENTS.md`, `docs/TESTING_MODEL.md`, and the normative experiment specification in `docs/AGENT_GET_CAPABILITY_EXPERIMENT.md`. Also read `docs/AGENT_ACCESS.md` to preserve the boundary between this experiment and Loom's ordinary authenticated machine access.

## Goal

Build the smallest deployable `/agent-lab` surface needed to test one empirical question: when an external constrained agent is explicitly given an entrance URL, can it follow GET-shaped affordances to create persistent state and retrieve the exact same state later?

This is deliberately an experiment, not a new general Loom API pattern.

## Current relevant behavior

- Loom's ordinary machine access uses authenticated project-scoped credentials and remains governed by `docs/AGENT_ACCESS.md`.
- Normal application routing resolves browser/machine principals for protected Loom behavior.
- No `/agent-lab` capability-chain implementation exists yet.
- Existing D1 migrations run through `0013_expand_compression_size.sql`; this slice must use migration `0014` unless the repository has changed before implementation begins.
- CI now runs the baseline repository battery on pull requests and pushes to `main`.

Verify all of these points against the current repository before editing.

## Exact implementation scope

### 1. Add isolated lab persistence

Add migration `migrations/0014_agent_get_capability_experiment.sql` using dedicated experimental tables. Keep lab state separate from participants, projects, ordinary documents, machine credentials, and agent check-ins.

The schema must support:

- anonymous chains;
- hashed single-use capabilities bound to a chain and expected operation;
- persistent scratch entries with stable IDs and deterministic chain-local ordering;
- append-only experiment events.

Use appropriate foreign keys, uniqueness constraints, and indexes. Scratch entries should use a chain-local `entry_index` with `UNIQUE(chain_id, entry_index)` or an equivalently strong invariant.

Do not persist raw capabilities. Event rows must not duplicate arbitrary scratch values; record safe identifiers/metadata such as byte count or content hash where useful.

### 2. Add the three GET routes

Implement the protocol exactly as defined in `docs/AGENT_GET_CAPABILITY_EXPERIMENT.md`:

- `GET /agent-lab/enter`
- `GET /agent-lab/write?cap=A&value=<value>`
- `GET /agent-lab/read?cap=B&id=<entry-id>`

Use a focused module such as `src/agent-lab.ts` rather than mixing experimental persistence logic throughout normal document/project code.

Route the `/agent-lab` surface before ordinary principal/authentication requirements so anonymous callers can use it. This routing exception must be narrowly limited to the explicit lab routes and must not weaken authorization elsewhere.

### 3. Plain-text affordances

Successful responses must use `text/plain; charset=utf-8` and `Cache-Control: no-store`.

Return absolute, directly usable next-step URLs. A caller should not need JSON, custom headers, cookies, or knowledge of Loom's internal API conventions to continue the chain.

The enter response issues A and points directly to the write route. The write response returns the stable entry ID and a directly usable read URL containing B and that entry ID. The read response returns the exact stored value and successor capability C in a directly usable continuation representation.

Do not add a fourth operation merely to consume C in this slice.

### 4. Capability contract

Capabilities must:

- be generated with a cryptographically secure random source;
- be high entropy and opaque;
- be stored only as one-way hashes suitable for lookup/verification;
- be bound to one chain and one expected operation;
- expire 24 hours after issuance;
- be successfully consumed at most once;
- issue a successor only after successful protected action;
- reject malformed, unknown, expired, replayed, wrong-operation, and wrong-chain use without issuing a successor.

Capability consumption, protected action, and successor issuance must be atomic enough that concurrent/repeated use cannot create duplicate entries or fork successors. Use D1 transaction/batch semantics or another repository-native atomic pattern that actually preserves this invariant; do not implement a check-then-act race.

### 5. Scratch payload contract

`value` is a required nonempty plain string.

Maximum size is 1,024 bytes in UTF-8, not 1,024 JavaScript characters. Validate byte size accordingly. Accept a payload exactly at the byte limit and reject larger payloads.

Entries persist after capability expiry. Do not add entry expiry or cleanup in this slice.

### 6. Observability

Record append-only events sufficient to reconstruct chain creation and capability use/rejection without storing raw capabilities or copying arbitrary entry content into telemetry.

At minimum retain timestamps, chain identity where known, operation/outcome, and safe target/capability metadata appropriate to the event. Keep this simple; this is experiment instrumentation, not a generalized analytics system.

### 7. Preserve discovery isolation

Do not expose or advertise the lab through:

- `llms.txt`;
- sitemap changes;
- normal Loom pages;
- project/participant manifests;
- crawler metadata;
- agent discovery hints.

Experiment 1 receives the entrance URL explicitly from the operator.

## Required tests

Add focused integration coverage for the lab protocol. At minimum test:

1. `/agent-lab/enter` creates a fresh chain and returns a usable absolute write URL.
2. A random nonce can be written and read back exactly through `enter -> write -> read`.
3. successful responses are plain text and `Cache-Control: no-store`.
4. empty values are rejected.
5. exactly 1,024 UTF-8 bytes are accepted and 1,025+ bytes are rejected, including a multibyte-character case so byte-counting is real.
6. replaying A cannot create a second entry or issue another B.
7. replaying B cannot perform another successful protected read or issue another C.
8. a capability cannot be used for the wrong operation.
9. an entry from another chain cannot be read through B.
10. expired capabilities are rejected.
11. malformed/unknown capabilities are rejected without useful token-oracle leakage.
12. raw capability values are absent from capability/event persistence.
13. concurrent/repeated consumption cannot fork the chain or duplicate the protected action where the test environment can exercise this reliably.
14. unrelated protected Loom routes remain protected; the anonymous routing exception is lab-only.

Use direct DB inspection in tests where necessary to prove persistence/security invariants rather than inferring them only from HTTP responses.

## Migration verification

Because this slice adds schema, follow `AGENTS.md` migration rules. Verify both:

- a fresh database applying all migrations through 0014;
- an existing pre-0014 database upgraded through 0014 without resetting or losing existing Loom data.

Do not edit historical migrations.

## Acceptance criteria

The slice is complete when:

- migration 0014 adds isolated lab persistence without altering ordinary Loom data semantics;
- the three lab routes implement the documented protocol;
- an anonymous caller can complete the nonce write/read path using only returned GET URLs;
- A and B are genuinely one-use and cannot fork/replay;
- capabilities expire after 24 hours;
- payload validation uses UTF-8 bytes and enforces the 1,024-byte maximum;
- raw capabilities are never persisted;
- scratch content is not duplicated into event telemetry;
- lab responses are plain text, absolute-URL driven, and non-cacheable;
- the lab is not advertised through existing machine discovery surfaces;
- ordinary Loom authorization remains unchanged;
- required tests and repository baseline checks pass in CI.

## Required checks

Run where the environment permits:

```text
npm test
npm run typecheck
git diff --check
```

Also perform the smallest meaningful functional smoke test of the actual rendered/deployed-equivalent request chain available in the environment: enter, write a unique nonce, read it back, then demonstrate replay rejection. Do not use production for Codex testing.

If Codex's environment cannot install dependencies because of its known registry/network restrictions, report that limitation exactly and do not alter dependencies or security settings to compensate. The PR's GitHub Actions run is the independent baseline verification layer.

## Documentation

`docs/AGENT_GET_CAPABILITY_EXPERIMENT.md` is the durable source of truth for this experimental protocol. Update it only if implementation reveals a necessary clarification; do not silently change settled semantics.

Do not fold this experiment into `docs/AGENT_ACCESS.md`. Ordinary authenticated machine access and the isolated GET lab intentionally remain separate concepts.

## Explicit non-goals

Do not implement:

- lab discovery, crawler bait, or `llms.txt` changes;
- an index/list/search endpoint;
- a fourth route to consume capability C;
- multiple-write loops;
- lab UI or management controls;
- participant/agent identity or signup;
- project/document access from lab capabilities;
- ordinary document mutation;
- compression behavior;
- agent check-in changes;
- credits, work-for-access, reputation, or quotas;
- agent-to-agent messaging or coordination semantics;
- entry editing/deletion/cleanup;
- generalized GET mutation outside `/agent-lab`;
- changes to ordinary machine credentials/authentication;
- deployment automation;
- unrelated refactors or cleanup.

Keep the implementation intentionally small. The purpose is to get a real experimental fixture deployed so the external-agent behavior can be tested before Loom invests in later recognition, discovery, or coordination experiments.