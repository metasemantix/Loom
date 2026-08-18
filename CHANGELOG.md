# Changelog

- Added reversible project archive enforcement, contribution lifecycle tombstones, safe leave/removal semantics, and owner-side controls for former contributors.
- Active contributions now track current source titles, while unavailable contribution tombstones freeze permitted metadata; lifecycle-conditioned writes and transitions also reject stale archive races.
- Former contributors can explicitly reauthorize a suspended contribution without regaining project membership or visibility.
- Deleting a participant-owned source now erases its body and source history while retaining an unavailable project contribution tombstone with stable identity and provenance.
- Source deletion and contribution linking now enforce source availability atomically, and recontributing a retracted relationship records a structured restoration event.

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

- Added human-usable projects with descriptions, document pickers, consensual
  expiring invitations, owner-selected administrators, ownership transfer, and
  safe leave/removal controls.
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
- Consolidated the human interface around compact document/project collections,
  inline creation and confirmation panels, a permission-aware document reader,
  inline invitation-link copying, and account-level export in Control Room.

### Security

- Document mutations require an authenticated owner session and a same-origin
  request.
- Participant ownership is resolved from server-side session state rather than
  client-supplied participant identifiers.
