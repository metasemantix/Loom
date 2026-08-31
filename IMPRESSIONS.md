# IMPRESSIONS.md

This is a lightweight, non-authoritative scratchpad for implementation weirdness noticed while working on Loom.

It exists so coding agents can preserve useful observations that are outside the current bounded task without either losing them or turning them into accidental scope creep.

## How to use it

Writing here is optional. Do not invent an impression just to fill the file, and do not treat this as a completion checklist.

Add an entry when you encounter something that is plausibly worth revisiting but is not required to complete the current task safely. Good examples include:

- a suspiciously duplicated authorization check;
- an awkward abstraction boundary;
- a brittle test helper;
- surprising schema coupling;
- an unclear name that repeatedly causes confusion;
- a pre-existing behavior that looks inconsistent with nearby architecture but is not part of the current assignment;
- a small deployment/tooling papercut that is real but not worth derailing the slice.

Do **not** use this file to make product or architecture decisions. If something conflicts with settled architecture and affects the current task, report/fix the conflict through the normal task path instead. If something requires a future decision, record the uncertainty rather than choosing a policy here.

Do not fix an impression merely because you noticed it. **Notice -> record -> continue the bounded task.** Act on it only when it becomes part of an explicit task or when leaving it unfixed would make the current change incorrect or unsafe.

Do not record secrets, credentials, private user data, document bodies, or other sensitive content.

## Entry format

Keep entries short and concrete. Prefer this shape:

### YYYY-MM-DD — short description

- **Where:** file/function/schema/test area
- **Observed:** what was surprising or awkward
- **Why it may matter:** the plausible maintenance, correctness, testing, security, or UX consequence
- **Status:** untriaged / promoted to task-or-issue / resolved

Links to a PR, commit, test case, or relevant architecture document are welcome when useful.

## Maintenance

This file is intentionally ephemeral compared with `DECISIONS.md`, normative architecture documents, and executable tests.

When an impression becomes a settled decision, implementation task, issue, or tested invariant, move the durable substance to the appropriate place and mark or remove the scratchpad entry. Resolved debris should not accumulate forever.