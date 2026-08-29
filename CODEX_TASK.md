# Current Codex Task

Implement the current bounded Loom slice: **scheduled project deletion and provenance shell**.

Read `AGENTS.md`, `docs/PROJECT_LIFECYCLE.md`, `docs/PROJECT_NATIVE_DOCUMENTS.md`, `docs/CONTRIBUTION_LIFECYCLE.md`, `docs/TESTING_MODEL.md`, and relevant decisions in `DECISIONS.md` before changing code. Treat those settled ownership, lifecycle, provenance, account-deletion, and authorization semantics as authoritative.

## Goal

Implement project deletion end to end according to `docs/PROJECT_LIFECYCLE.md`.

The slice includes:

- owner-only scheduling of project deletion with exact current-project-title confirmation;
- a fixed three-day project deletion deadline;
- immediate archived behavior while deletion is pending;
- owner-only cancellation before the deadline, returning to ordinary archived state;
- preventing admins or ordinary archived-project recovery/unarchive paths from reviving a deletion-scheduled project;
- server-authoritative deadline and lifecycle checks at mutation/finalization boundaries;
- finalization into a terminal provenance shell;
- destruction of project-owned document bodies and revision content/diffs while retaining only the permitted shell/history metadata;
- preservation of participant-owned source documents while ending project-mediated access and retaining only permitted contribution provenance/tombstones;
- safe interaction with account deletion so worker/finalizer ordering cannot create a recovery loophole or reverse the intended project-before-account deadline ordering;
- human UI sufficient to schedule, inspect, and cancel pending deletion with clear deadline/state presentation.

Do not implement a general notification subsystem in this slice. Preserve structured lifecycle events/state so notifications can consume them later.

## Acceptance and regression requirements

Extend the operation/decision-tree acceptance catalog and deterministic reference world as needed. Cover at minimum:

- owner vs admin/member deletion scheduling;
- exact-title confirmation success/failure;
- scheduling from active and archived states;
- three-day deadline behavior, including exact deadline boundary;
- allowed archived-project operations while deletion is pending;
- forbidden mutation/unarchive/role/ownership operations while deletion is pending;
- owner cancellation before deadline and denial at/after deadline;
- cancel then reschedule producing a fresh fixed three-day deadline;
- final shell contents and terminal behavior;
- POD body/revision-content destruction with non-content revision/provenance history retained;
- OOD source survival and loss of project-mediated body access;
- outstanding invitation revocation/non-revival;
- owner account deletion/finalization ordering and race cases;
- migration from populated existing schemas without data loss or accidental cascade behavior.

Use the existing clock/test seams and acceptance harness rather than weakening expectations to fit implementation. Add focused worker/integration/UI regressions where they provide coverage the acceptance harness does not.

Run the complete validation required by `AGENTS.md`. At completion, report what changed, tests added or updated, any implementation defects or genuine architecture ambiguities discovered, migration behavior, and validation results.
