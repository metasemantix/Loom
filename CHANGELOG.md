# Changelog

## 2026-08-14

- Added owner-controlled document visibility, title, and logical-path changes
  with explicit metadata history events separate from content revisions.
- Added faithful Markdown, text, and validated JSON uploads with source metadata.
- Added a Control Room for stable Loom identity and editable display names.
- Added projects as shared references over participant-owned documents, with
  membership and `members_and_agents` / `agents_only` read-audience policies.

All notable changes to Loom are documented in this file.

This changelog records changes to the Loom application and its public
interfaces. Participant document revisions remain part of each participant's
data and are not recorded here.

## Unreleased

### Added

- Discord sign-in backed by stable Loom user and participant identities.
- Participant-owned Markdown, JSON, and plain-text documents with public or
  private visibility.
- Immutable document revision history and participant-controlled hard deletion.
- Owner-only document creation, editing, history, and deletion in My Space.
- Stable Markdown and JSON participant-context projections with visibility-aware
  authorization.

### Changed

- Local OAuth starts now use the configured callback origin when switching
  between `localhost` and `127.0.0.1`.

### Security

- Document mutations require an authenticated owner session and a same-origin
  request.
- Participant ownership is resolved from server-side session state rather than
  client-supplied participant identifiers.
