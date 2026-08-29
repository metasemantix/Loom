# Loom Testing Model

Loom's acceptance tests should model consequential operations, not merely individual implementation functions or UI labels.

The canonical shape is:

`actor + operation + target + relevant state -> expected result + expected state transition`

UI controls and agent/API clients may invoke the same underlying operation. Tests should therefore distinguish operation semantics from UI wiring.

## Decision trees

For each user-visible or client-visible operation, identify the meaningful decision branches that affect authorization, visibility, lifecycle, ownership, provenance, or state transitions. Typical variables include authentication, account lifecycle state, ownership, project role/membership, project lifecycle state, contribution state, document ownership type, project audience, creator entitlement, invitation state, source availability, and relevant deadlines.

Do not generate meaningless Cartesian products. Record only semantically possible and consequential branches.

Each meaningful leaf should have a stable acceptance-case name and an executable test that asserts the expected result and any important resulting or preserved state. Nearby execution is not coverage unless the expected outcome is actually asserted.

The coverage structure should make it possible to answer which branches of an operation remain untested without reading the entire suite.

## Reference test world

Maintain a deterministic, reusable populated Loom test world with stable IDs and readable aliases. It should include the important states needed by current semantics, including representative active/admin/member/former/deletion-pending/deleted participants; active and archived projects; members-and-agents and agents-only audiences where relevant; participant-owned documents with revisions and visibility states; active/suspended/retracted contributions; project-native documents with live and expired creator entitlements; former-member creator cases; deleted-actor provenance; independent project-owned copies with source provenance; and relevant invitation states.

Tests should recreate/reset this world so one scenario cannot contaminate another.

Deadline-sensitive tests must not depend on the wall clock. Use a deterministic test-time mechanism so before / exactly-at / after boundary cases are reproducible without weakening production deadline enforcement.

## Migration fixtures

Historical migration fixtures are separate from the current-schema reference world. Preserve populated pre-migration states and apply migrations forward. Do not construct an alleged historical fixture from the newest schema.

Migration tests must assert semantic preservation of important rows and relationships, not rely on `PRAGMA foreign_key_check` alone.

## UI acceptance

For consequential controls, test both:

1. whether the control is exposed appropriately for the current state; and
2. whether activating it invokes the intended operation and produces the expected result/state change.

Continue to verify rendered inline browser JavaScript as required by `AGENTS.md`.

## When tests expose discrepancies

A failing acceptance test is evidence to investigate, not something to silence.

- If settled architecture clearly defines the expectation, fix the implementation narrowly and retain the regression test.
- If architecture is genuinely ambiguous or conflicting, report the ambiguity rather than inventing policy.
- Never weaken an expectation merely to match existing behavior.

The goal is not maximum test count. The goal is to make Loom's behavioral contract explicit, executable, and difficult to accidentally contradict.