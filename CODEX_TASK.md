# Current Codex Task

Implement the next bounded Loom slice: **deterministic acceptance harness**.

Read `AGENTS.md` and `docs/TESTING_MODEL.md` first, then the settled architecture, current implementation, migrations, and existing tests they require.

## Goal

Turn the testing model into executable infrastructure for the Loom functionality that exists now.

- Inventory current consequential operations and their meaningful decision branches. Give branches stable, searchable acceptance-case names and make missing coverage visible.
- Build a deterministic reusable populated reference test world with stable IDs/readable aliases and the important current participant, project, document, contribution, invitation, lifecycle, audience, provenance, copy, and creator-entitlement states.
- Make deadline-sensitive tests deterministic rather than wall-clock dependent.
- Keep historical migration fixtures separate; preserve the populated pre-0007 migration regression.
- Exercise UI wiring separately from operation semantics where the existing DOM harness permits it.

Use the harness to test the implementation as it exists. If a test exposes a clear conflict with settled architecture, fix the implementation narrowly and retain the regression. If policy is ambiguous, report it rather than guessing or weakening the test.

Explicitly include the three known project-native coverage gaps: admin create/edit; creator voluntary leave while the 72-hour delete entitlement remains live without ordinary project access; and deleted creator/revision-actor provenance with the project-owned document surviving.

Do not add new product semantics, unrelated features, or a heavyweight test framework.

Run the complete normal validation from `AGENTS.md`. `npm test` must include the acceptance suite.

At completion, report the acceptance structure/reference world created, previously missing branches covered, defects discovered and fixes made, ambiguities left unresolved, and validation results.