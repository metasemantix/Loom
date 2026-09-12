# Current Codex Task

Implement Slice 2b of the experimental Loom agent keyboard: preserve the existing capability-chain keyboard protocol and replace its plain-text action-URL presentation with minimal page-native HTML hyperlinks.

Read and follow `AGENTS.md`, `docs/TESTING_MODEL.md`, the normative experiment specification in `docs/AGENT_GET_CAPABILITY_EXPERIMENT.md`, and the current implementation/tests. Treat the repository as the source of truth.

## Goal

Test one narrow representation boundary discovered through external experiments:

- Slice 2a already supplies complete server-generated keyboard URLs as plain text.
- In the tested ordinary-chat environment, the agent could retrieve and understand that menu but could not traverse even the exact plain-text choice URLs.
- A separate LLM Parcours experiment surfaced that page-native hyperlinks can be followable where URL construction/re-submission is not.

Slice 2b therefore changes only how the already-existing actions are represented. It must expose the same capability-bound keyboard actions as real HTML `<a href="...">` links, without changing the underlying state machine, capability semantics, persistence, authorization isolation, or discovery posture.

## Current relevant behavior

Verify these points against `main` before editing:

- Slice 1 `/agent-lab/enter -> write -> read` is deployed and must remain unchanged.
- Slice 2a keyboard routes are deployed:
  - `GET /agent-lab/keyboard/enter`
  - `GET /agent-lab/keyboard/choose?cap=<capability>&choice=<choice>`
  - `GET /agent-lab/keyboard/read?cap=<read-capability>&id=<message-id>`
- The keyboard alphabet is exactly lowercase `a-z`, `space`, and `done`.
- One menu uses one shared single-use choice capability across all 28 choices.
- A successful letter/space choice atomically consumes the current capability, persists one symbol, and issues one fresh successor choice capability.
- `done` atomically consumes the choice capability, completes the message, and issues one fresh read capability.
- Final read consumes that read capability and returns the exact completed value once.
- The 128-symbol bound, 24-hour expiry, capability hashing, replay protection, safe telemetry, and rejection classification are already implemented.
- Current menu and `done` responses are plain text.
- Existing keyboard tests parse URLs from plain-text responses.
- All lab responses currently use `Cache-Control: no-store`.

Do not redesign or reimplement the state machine merely because the presentation changes.

## Exact implementation scope

### 1. Render keyboard menus as minimal HTML

Change the successful response for:

- `/agent-lab/keyboard/enter`; and
- successful non-`done` `/agent-lab/keyboard/choose`

from plain text to minimal `text/html; charset=utf-8`.

Each menu response must contain:

- the exact current persisted keyboard value in a simple machine-readable/visible element; and
- exactly 28 real `<a>` elements in deterministic order:
  - `a` through `z`;
  - `space`;
  - `done`.

Each anchor must:

- have visible text equal to its choice label;
- have an absolute `href` pointing to the existing `/agent-lab/keyboard/choose` route;
- contain the current raw choice capability and its server-defined `choice`;
- require no URL editing, interpolation, query construction, JavaScript, form submission, cookie, custom header, or redirect.

All 28 hrefs in one menu must continue to share the same raw capability and differ only by choice.

Do not display the raw URL as visible text merely to preserve the old representation. The experimental variable is that the action is now a page-native hyperlink.

### 2. Render the post-`done` action as one real hyperlink

A successful `choice=done` request must keep all existing atomic completion/capability semantics, but change its success representation to minimal HTML.

The response must contain exactly one actionable `<a>` element:

- visible label: a simple stable label such as `read`;
- absolute `href`: the existing final `/agent-lab/keyboard/read?cap=...&id=...` target using the freshly issued read capability and authoritative message ID.

Do not emit another keyboard menu after `done`.

### 3. Keep final read and rejection responses plain text

Do not broaden the representation change further than needed.

- Successful final keyboard read remains `text/plain; charset=utf-8` and returns the exact stored value in the established format.
- Keyboard capability rejections/errors remain simple plain text.
- Slice 1 responses remain unchanged.

### 4. Preserve cache behavior and dynamic uniqueness

All affected responses must continue to send `Cache-Control: no-store`.

Do not add independent random cache-buster/nonce query parameters in this slice.

The existing capability chain already gives every successor state a fresh opaque capability:

- every successful symbol produces a fresh choice capability;
- `done` produces a fresh read capability.

That capability is the intentional dynamic suffix/state discriminator. Preserve it unobstructed so the experiment can directly observe the capability chain rather than introducing a second random URL dimension.

The static entrance route is allowed to remain static; every fetch creates a fresh chain/capability and its response is `no-store`.

### 5. HTML safety

Follow `AGENTS.md` HTML safety rules.

Do not introduce unsafe interpolation patterns for dynamic text or attribute values. Escape all values placed into HTML text/attributes correctly, including current message text and generated hrefs, even though the current keyboard alphabet and capability format are constrained.

Keep the HTML deliberately tiny. No CSS framework or client-side code is needed.

### 6. Preserve the existing protocol exactly

Do not change:

- route paths or query parameter names;
- keyboard alphabet/order;
- choice capability format/prefix;
- single-use semantics;
- shared-capability sibling behavior;
- atomic consume/mutate/successor behavior;
- 24-hour expiry;
- 128-symbol limit;
- empty-message `done`;
- final-read single use;
- persistence schema;
- telemetry schema or taxonomy;
- raw-capability non-persistence;
- caller-supplied read-ID telemetry protections;
- auth isolation;
- discovery posture.

No database migration should be needed for this slice. Do not add one unless a genuinely unavoidable correctness issue appears; if so, stop and report it rather than silently expanding scope.

## Required tests

Update the focused keyboard integration tests to exercise the actual rendered hyperlinks, not reconstructed equivalent URLs.

At minimum prove:

1. `/agent-lab/keyboard/enter` returns `text/html; charset=utf-8` and `Cache-Control: no-store`.
2. Its HTML contains exactly 28 anchors in deterministic `a-z`, `space`, `done` order.
3. Each anchor's visible label matches the choice.
4. Each `href` is a complete absolute URL to the existing choose route.
5. All 28 hrefs in one menu carry the same raw choice capability.
6. The current value is represented exactly and safely.
7. Following the actual returned `p` anchor persists `p` and returns a new HTML menu whose 28 anchors share a fresh successor capability.
8. A deterministic path follows actual returned anchors through `p -> e -> b -> b -> l -> e`, confirming each persisted partial value as existing tests already do.
9. Consumed sibling anchors still reject and cannot fork state.
10. `space`, invalid choice, expiry, replay, wrong operation, cross-message rejection, length limit, concurrency, and telemetry safety remain covered and semantically unchanged.
11. At 128 symbols, rejected extra symbols do not consume the capability and the actual `done` sibling anchor remains usable.
12. Successful `done` returns `text/html; charset=utf-8`, `Cache-Control: no-store`, and exactly one anchor.
13. That anchor's href is the complete final read URL containing the fresh read capability and authoritative message ID.
14. Following that actual returned read href returns `text/plain; charset=utf-8` with the exact completed value and no successor.
15. Empty-message `done` still works.
16. Rejection responses remain plain text and `no-store`.
17. HTML success pages contain no forms, buttons, scripts, redirects, or JavaScript-driven action mechanism.
18. Raw capabilities remain absent from persistence/event rows.
19. Existing Slice 1 tests remain green with unchanged semantics.
20. Unrelated protected Loom routes remain protected.

Do not add a new HTML parsing dependency just for these tests if the small deterministic markup can be inspected reliably with existing tooling.

## Acceptance experiment

The deployed behavior should support this external black-box run without URL construction:

1. operator supplies `/agent-lab/keyboard/enter`;
2. agent follows a presented letter hyperlink;
3. server returns a fresh HTML menu with a fresh capability;
4. agent recursively follows presented hyperlinks to compose a short value;
5. agent follows `done`;
6. agent follows the single presented read hyperlink;
7. exact persisted value is returned.

For deterministic smoke verification, compose `pebble` entirely by following hrefs extracted from the actual responses.

Do not use production for Codex testing.

## Required checks

Run where the environment permits:

```text
npm test
npm run typecheck
git diff --check
```

Also perform the smallest non-production functional smoke available using hrefs parsed from responses:

`enter -> p -> e -> b -> b -> l -> e -> done -> read`

Verify exact `pebble` readback and rejection of at least one consumed sibling capability.

If Codex cannot install dependencies because of registry/network restrictions, report that exactly and do not alter dependency or security settings to compensate. GitHub Actions is the independent baseline verification layer.

## Documentation

`docs/AGENT_GET_CAPABILITY_EXPERIMENT.md` is the durable source of truth and has already been updated for Slice 2b. Keep implementation aligned with it.

Only amend that document if implementation reveals a necessary clarification. Do not silently alter the experimental question or settled capability semantics.

## Explicit non-goals

Do not add:

- autocomplete, dictionary completion, word/phrase suggestions, or larger action alphabets;
- buttons, forms, POST transport, JavaScript controls, redirects, or alternate interaction primitives;
- extra cache-buster/nonces beyond the existing fresh capability chain;
- uppercase, digits, punctuation, Unicode input, backspace/delete, cursor movement, or editing;
- arbitrary free-form text/query submission;
- new persistence tables or migrations;
- discovery, crawler bait, `llms.txt`, sitemap, or normal Loom UI exposure;
- project/document access;
- participant/agent identity;
- agent messaging or coordination;
- work-for-access, credits, reputation, or quotas;
- generalized GET mutation outside the isolated lab;
- ordinary machine-auth changes;
- unrelated refactors or cleanup.

Keep this slice deliberately small. The experimental variable is only: **the same server-generated capability-bound action targets, represented as native hyperlinks instead of plain-text URLs.**
