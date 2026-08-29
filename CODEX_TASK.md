# Current Codex Task

Implement the current bounded Loom slice: **project document UX quick fixes**.

Read `AGENTS.md`, `NOW.md`, `docs/TESTING_MODEL.md`, and the settled document/project architecture before changing code. Treat existing ownership, contribution, provenance, audience, lifecycle, and creator-deletion semantics as authoritative.

## Goal

Implement the current items in `NOW.md` as one focused UX pass:

- Make project document actions compact/collapsed.
- Group **write new**, direct **upload**, and **copy from My Space** under **Create project-owned document**; all three produce project-owned documents.
- Keep participant-owned **Add my document to project** visibly separate because it creates/maintains a contribution relationship rather than project ownership.
- Stop asking users to supply `logical_path` during ordinary project-owned document creation. Assign a sensible Loom-side default; preserve explicit rename/move for later organization.
- Give project-owned documents a discoverable per-document revision-history view using the existing revision/provenance model rather than Project activity as a substitute.
- In **My Space**, show which projects currently have a participant-owned document linked/contributed. Do not count independent project-owned copies as links merely because they retain source provenance.

Preserve existing copy independence and all settled authorization/lifecycle behavior. Do not redesign ownership semantics or begin project deletion in this slice.

Update affected acceptance/operation coverage under `docs/TESTING_MODEL.md`. Add regression tests for new behavior and UI wiring where practical, using the existing harness rather than weakening expectations to fit the implementation.

Run the complete validation required by `AGENTS.md`. At completion, report what changed, tests added/updated, any defects or ambiguities discovered, and validation results.
