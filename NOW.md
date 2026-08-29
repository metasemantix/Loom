# NOW

Small, bounded fixes discovered through actually using Loom.

This is the quick-fix drawer: things worth doing soon because they remove immediate friction or clarify an already-settled interaction, but which do not deserve a new architectural slice. Keep entries small. Larger features, unresolved architecture, and speculative ideas belong elsewhere.

## Project page — compact document actions

- Collapse **Create project-owned document** by default.
- Inside that area, offer three ways to create the same project-owned object:
  - **Write new** — the existing project-native creation form.
  - **Upload** — direct project-owned upload for the document types Loom already accepts (`.md`, `.txt`, `.json`), without routing through personal ownership first.
  - **Copy from My Space** — the existing copy operation, retaining the explicit explanation/confirmation that the result is an independent project-owned document and will not follow later source changes, privacy changes, retraction, or deletion.
- Keep participant-owned contribution/linking separate, under a collapsed action such as **Add my document to project**. It must remain clear that the participant retains ownership and write/delete control while the project receives access according to the contribution rules.
- Prefer collapsed secondary project actions so the project page foregrounds the project and its documents rather than presenting every available operation as an expanded form.

## Project-owned document creation — remove internal path plumbing

- Do not require the user to choose or type `logical_path` when creating an ordinary project-owned document.
- Loom should assign a sensible logical path automatically. Internal document geography should not be prerequisite knowledge for creating a document.
- Remove the current path autocomplete/dropdown from the ordinary creation flow rather than polishing it.
- Preserve rename/move as an explicit later operation where changing document organization is actually the user's intent.

## Project-owned document revision history

- Give an opened project-owned document its own discoverable revision-history affordance.
- Do not rely on **Project activity** as the document's revision-history UI. Project activity answers what happened in the project; document history answers what happened to this document.
- Reuse the existing revision/provenance model rather than introducing a second history system.

## My Space — show project links

- For each participant-owned document in **My Space**, show whether it is currently linked/contributed to projects and, when applicable, which projects.
- Project names should be intelligible and preferably navigable rather than exposing raw IDs.
- This display represents actual participant-owned contribution/link relationships only.
- Do **not** treat project-owned copies as current links merely because they retain source provenance. A copied document is independent project-owned state, not an ongoing relationship to the source document.
- Keep the first-pass presentation compact. Rich lifecycle distinctions can remain secondary unless they are needed to avoid misleading the user.

## Minor cosmetic follow-up

- Make project-owned document **Revision history** collapsible after it has been opened; default it closed.
- Give **Create project-owned document** and **Add my document to project** consistent layout, spacing, and panel treatment. Their semantics remain deliberately distinct.

These are UX changes around settled document and ownership semantics, not changes to the ownership model itself.
