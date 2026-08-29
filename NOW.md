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

These are UX changes around settled ownership semantics, not changes to the ownership model itself.
