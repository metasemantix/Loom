# Changelog

- Added public `/llms.txt` and `/.well-known/loom-agent` discovery, plus an austere `/agent` bearer-token workbench over Loom's existing machine API.
- Added owner-opt-in `agent_checkin:write` credentials and bounded machine check-ins with durable credential-attributed project activity; existing credentials remain read-only.

- Improved project cards with reload-on-expand show/hide details, clearer contribution and leave controls, owner-side contribution restoration, and a safe human-readable structured activity timeline.

- Fixed archived-project Unarchive confirmation rendering and removed duplicated project overview details from the expanded administration view.

- Added reversible project archive enforcement, contribution lifecycle tombstones, safe leave/removal semantics, and owner-side controls for former contributors.
- Active contributions now track current source titles, while unavailable contribution tombstones freeze permitted metadata; lifecycle-conditioned writes and transitions also reject stale archive races.
- Former contributors can explicitly reauthorize a suspended contribution without regaining project membership or visibility.
- Deleting a participant-owned source now erases its body and source history while retaining an unavailable project contribution tombstone with stable identity and provenance.
- Source deletion and contribution linking now enforce source availability atomically, and recontributing a retracted relationship records a structured restoration event.
- First-time document contributions now record structured `contribution_added` provenance separately from later restoration events.

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

## Account lifecycle

- Added immutable human-readable participant provenance identifiers and minimal former-user tombstones.
- Added informed account-deletion scheduling with owned-project prerequisites, a configurable 72-hour frozen grace period, export and cancellation access, and a countdown UI.
- Added centralized pending-account mutation gating and a retry-safe Cloudflare scheduled finalizer that destroys participant content/authentication data, revokes invitations, removes memberships, and preserves unavailable contribution provenance.
- Hardened the frozen grace period against owner-authenticated context/read bypasses while preserving ordinary public reads for other callers.
- Reduced finalized participant tombstones to stable participant/provenance identity and finalization state, added ordinary project departure history, and made provider re-registration and provenance-collision handling safe.
- Preserved the owned-project deletion prerequisite during grace by blocking unarchive while the current owner is deletion-pending, and rebuilt participant references with D1-supported deferred foreign-key migrations.
- Added explicit ownerless archived-project recovery: after a former owner is finalized, an existing admin may deliberately become owner while unarchiving; ordinary members cannot claim ownership and active ownerless projects remain impossible.
- Separated ownerless recovery from ordinary unarchive into an explicit admin-only recovery action, so an unarchive request can never implicitly claim ownership.
- Made the stored deletion deadline the immediate logical content-access boundary and increased scheduled cleanup frequency to once per minute.
- Made invitations created by a participant logically unavailable at that participant’s deletion deadline, including commit-time acceptance/decline guards before physical revocation.

## Project-native documents

- Added explicitly project-owned documents and independent project copies with stable IDs, revision/source provenance, project exports, and preserved participant-owned contribution behavior.
- Added fixed 72-hour creator deletion deadlines, former-member deletion controls, exact deadline/account-lifecycle enforcement, and archive- and role-aware commit-time mutation guards.
- Added project-native creation, reading, editing, metadata management, deletion, copy, activity/history, export, migration, UI, and regression coverage.
- Closed human `agents_only` body access through native-document history and project export, made copy-source validation commit-authoritative, aligned document controls with live authority, split metadata/content saves, and preserved deletion-time titles in project activity.
- Corrected migration 0007 to rebuild revision/event child tables safely before replacing `documents`, preserving existing revisions, metadata history, and contribution relationships during upgrades.
