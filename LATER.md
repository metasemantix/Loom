# Later

Things worth preserving without expanding the current MVP.

## Codex implementation handoff

When it is time to turn the infrastructure MVP into running code, hand Codex the repository with this instruction:

> Implement the smallest working vertical slice described in `docs/infrastructure-mvp.md`. Prefer boring Cloudflare-native primitives. Do not expand scope. When the spec leaves a choice open, choose the simplest reversible option and document it.

The first vertical slice should proceed in this order:

1. sign in;
2. create and edit one's own participant space;
3. persist documents in the database with deletable revision history;
4. expose the permitted data through stable Markdown/JSON representations;
5. create/revoke a scoped agent credential;
6. permit that agent to perform one bounded write inside its authorized area;
7. create an experiment;
8. expose an experiment corpus for agent retrieval.

Implementation choices that may be made pragmatically rather than designed in advance include:

- exact authentication provider/mechanism;
- database schema details;
- session handling;
- route names;
- frontend framework and component structure.

Choose the simplest reversible option that satisfies the infrastructure contract. These choices must not introduce backend AI, semantic memory, matching, autonomous coordination, a social feed, or other features outside the infrastructure MVP.

## Human-facing product surfaces

As Loom grows beyond the first vertical slice, avoid turning My Space into one screen containing every control.

Likely surfaces include:

- **Profile** — lightweight participant identity and public-facing entry points. Rich self-description can remain ordinary corpus documents rather than becoming a rigid profile schema.
- **Documents** — browse/search, folders and paths, visibility, project/manifest membership, revision history, move/rename/delete, and export.
- **Create / Upload** — create Markdown, text, or structured artifacts and upload existing files without manual pasting. Creation should eventually offer an explicit destination/owner selector such as `My Space` or an eligible project.
- **Projects / Collaborations** — membership, invitations, linked and project-owned corpus, manifests/discovery surfaces, access defaults, roles, and lifecycle controls.
- **Agents** — connected or authorized agents, discovery/read/write grants, bounded capabilities, and revocation.
- **Control Room** — display name, stable identity/lookup information, connected authentication providers, export, account deletion/withdrawal, security information, and global defaults.

These are conceptual areas rather than a commitment to a particular navigation structure.

## Document administration

Near-term document management should grow beyond create/edit/delete to include:

- changing public/private visibility after creation;
- freeform folder/path organization independent of permissions;
- moving and renaming artifacts;
- title/path search;
- file upload while preserving original source artifacts;
- project and discovery-surface membership;
- portable export.

When linking participant-owned documents into projects, replace manual document-ID entry in the normal UI with a human-readable picker/search over the participant's eligible documents. Keep the final Link action explicit and explain the resulting project read grant. Raw document-ID entry may remain available as an advanced/debugging mechanism rather than the primary workflow.

For creation and upload, provide an ownership destination such as `My Space` or a project in which the participant has permission to create project-owned artifacts. Choosing a project creates a project-owned artifact from the outset; choosing My Space creates a participant-owned artifact that can later be linked or deliberately copied into projects.

A future `Copy to project` action should create a new project-owned artifact rather than mutating ownership of the source. The confirmation should state prominently that the project copy is outside the original owner's sole control and will not disappear when the source is deleted. Preserve source provenance on the new artifact.

Full-text search can follow when corpus size justifies it. Semantic search should not be introduced merely because an LLM is available.

## Project and collaboration lifecycle

Projects should develop as shared link corpora over participant-owned artifacts while also supporting genuinely project-owned collaborative artifacts.

Near-term project work should include:

- project description;
- owner-chosen administrators;
- explicit owner transfer;
- project deletion;
- eventual archive/read-only state distinct from deletion;
- creation and invitations;
- membership and removal;
- project-level discovery/read defaults;
- whether human members may directly browse linked material or access is agent-only;
- whether newly authorized agents inherit access to the existing corpus;
- explicit collaborative-write grants where needed;
- behavior when a linked source artifact is removed, made private, or deleted.

Project defaults should do most of the work rather than requiring per-agent permissions on every linked artifact.

Project deletion should remove the active collaboration, invitations, access grants, references, and project-owned content while leaving participant-owned source documents alone. Preserve only the minimal historical project/membership shell needed for provenance. Archive should remain a separate lifecycle operation for intentionally retained, inactive/read-only projects.

Human membership should move from direct owner-side insertion to invitation and acceptance. Useful invitation mechanics include:

- revocable invite links;
- single-use links as a sensible default, with reusable links available when a project needs them;
- optional expiration such as 24 hours, 7 days, 30 days, or never;
- a pending-invites view showing creation/use status and allowing revocation;
- a project preview before acceptance containing enough context to make an informed choice (for example name, description, inviter/owner, member count, and read policy) without exposing the protected project corpus;
- a single invite flow that works for existing Loom participants and logged-out/new participants: authenticate if necessary, return to the invitation, then explicitly choose Join;
- explicit Leave project and Remove member actions whose access-revocation behavior follows the project membership semantics in `DECISIONS.md`.

A future role selector may be added to invitations when Loom has more than one meaningful member role. Do not invent a large role system prematurely. Initially, creator/owner-chosen `admin` plus ordinary `member` is sufficient. Admin permissions should be explicitly enumerated rather than assumed to equal ownership; project deletion should initially remain owner-only.

For known Loom participants, provide a human-facing invitation flow using display-name search and/or the short stable lookup identifier for disambiguation. Selecting a participant should create an invitation, not immediately add them as a member. Full immutable participant IDs should remain available for provenance and advanced lookup without becoming routine UI input.

## Project-owned artifacts

Project-owned artifacts should exist for material intended to belong to the collaboration itself rather than arbitrarily to the participant who first created it.

Useful examples include shared notes, decisions, specifications, meeting records, and project-maintained manifests.

Creation/upload should make ownership explicit. Do not infer ownership merely from which screen the participant happens to be viewing.

Participant → project copying should:

1. show the destination project and its relevant governance/access context;
2. warn that a new independent project-owned artifact will be created outside the participant's sole control;
3. make clear that deleting or changing the original will not revoke the project copy;
4. optionally run a preflight oversharing/security review;
5. create a new artifact identity and independent revision history;
6. record provenance back to the source artifact.

Do not implement a generic ownership-transfer operation until a concrete need justifies its additional governance semantics. Copy plus an independent decision about the original is sufficient initially.

Project-owned documents should survive changes in the project's human owner because the project, not that individual, owns them.

## Preflight sharing review

Consequential sharing operations, especially creation of independent project-owned copies, may offer a preflight review before final confirmation.

Use deterministic checks first for recognizable secrets, credentials, suspicious markup/code, encoded payloads, and similar mechanically detectable hazards. Optional Loom AI may add semantic review for likely accidental disclosure, unexpectedly sensitive passages, material that appears unrelated to the destination project, or other context-dependent concerns.

The review should point to concrete findings and let the participant inspect them. It should normally be advisory, with an explicit `Copy anyway` path, rather than silently editing the source or substituting AI judgment for the participant's decision. Platform-level security rules may separately block genuinely unsafe payloads.

## Discovery surfaces and manifests

The first deterministic manifest can remain simple, but the longer-term model may include multiple named discovery surfaces rather than one universal corpus index.

Likely examples include a public manifest and one manifest for each project or collaboration. Documents may participate in several discovery surfaces while remaining stored and owned only once.

Future manifest work may add editable descriptions, tags, classifications, or other compact retrieval hints. AI may propose or maintain these fields and suggest manifest membership, but the structures must remain inspectable, portable, and non-authoritative.

Manifest retrieval should remain cheap: discovery queries should not load full document bodies merely to discard them.

## Agent permissions and activity

Agent access should eventually distinguish discovery, read, arbitrary write, and bounded operations.

Useful future controls include:

- project-derived read grants;
- explicit write grants;
- bounded capabilities such as adding structured items without rewriting an entire artifact;
- revocation;
- an activity/audit view showing which agent read or changed an artifact or invoked a capability.

Trusted agent instructions and capability definitions must remain separate from retrieved corpus content.

## Identity and control room

Participants need a Loom-native identity layer independent of Discord or any other login provider.

Future work should include editable display names and a stable participant identity that does not change when the display name or authentication provider changes. A compact identity representation may be useful specifically for provenance and lookup.

Account deletion/anonymization needs a policy for preserving intelligible historical provenance without retaining more identity information than intended. In particular, different deleted actors should not collapse into one indistinguishable generic identity.

## Invitations, notifications, and contact

A functional activity inbox may eventually cover events such as:

- project invitations;
- accepted or declined invitations;
- access or capability requests;
- relevant shared-document changes;
- agent authorization events.

This should be operational notification infrastructure, not an engagement feed.

A coherent onboarding path should support invitation → authentication if needed → project preview → explicit acceptance → participant identity/project membership → project discovery. Merely opening an invitation URL must not create membership.

General direct messaging should remain deferred until Loom has a concrete reason to own the resulting spam, blocking, reporting, retention, and moderation problems. Lightweight contact requests or collaboration invitations may be enough.

## Sharing links

Revocable unlisted/tokenized read links may provide a useful middle ground between fully public documents and authenticated project membership.

Any such mechanism must remain distinct from public visibility and project membership and should be revocable without changing the source artifact's ownership.

Project invitation links are also capability-bearing URLs but have different semantics: they authorize a recipient to inspect an invitation and request/accept membership, not to read the project's protected corpus directly.

## Content security

Before agents routinely ingest arbitrary uploaded or shared material, Loom should develop a content-security pipeline.

Likely layers include deterministic checks for dangerous markup, executable/script content, suspicious encodings, secret patterns, and malformed metadata, with optional AI-assisted semantic checks for prompt injection, retrieval poisoning, tool-use bait, or attempted context exfiltration.

Findings should be visible and reviewable rather than silently rewriting source artifacts.

## Deferred intelligence

Loom's core backend does not require an LLM. AI belongs at the edges through participating agents. Optional future AI-derived indexing, tagging, summarization, relation extraction, manifest maintenance, coordination, or preflight sharing review should remain non-authoritative unless explicitly accepted through a permissioned workflow.

THREAD or another semantic/relation layer remains a later concern. Do not block the first running Loom implementation on it.
