# Agent and Machine Access

This document defines the first machine-facing access model for Loom. It is normative for authentication, project-scoped machine credentials, and agent-readable corpus retrieval unless a later decision explicitly replaces it.

## Core model: identity, authentication, and authorization are separate

Loom must not encode a human-versus-agent species distinction into authorization.

- A **participant/principal** is the stable identity used for ownership and provenance.
- An **authentication method** proves control of a principal or delegated access path. Discord browser sessions and opaque bearer credentials are different authentication methods.
- An **authorization grant** determines which Loom kingdom/object/capability the authenticated caller may use.

Do not add an `is_agent` boolean or a parallel agent-only ownership/permission system. Machine-originated activity may and should retain provenance identifying the credential/authentication path that performed it, but downstream authorization should operate on the authenticated principal/grant and current Loom state.

The generic web UI may call this feature **Agent access** because personal agents are the immediate use case. The underlying mechanism is deliberately client- and species-agnostic.

## First slice

The first machine-access slice is intentionally read-only and project-scoped.

A project owner can create a named machine credential for one project. Loom returns a high-entropy opaque bearer token exactly once. The stored credential record contains only a secure hash/fingerprint needed to authenticate it, never the recoverable raw token.

The credential carries:

- a stable credential/grant identifier;
- the authorizing participant/project owner as provenance;
- the project it is scoped to;
- a human-readable label for management/audit purposes;
- creation and optional revocation timestamps;
- read-only project-corpus authority for this slice.

The credential is not a project membership shortcut and must not manufacture a fake Discord identity. It is a machine authentication path plus an explicit project grant. Future work may generalize machine credentials so one principal can hold several grants or several credentials, but this slice should not require that larger delegation model.

Rotation may be implemented by creating a new credential and revoking the old one. Do not introduce JWT/self-contained authorization in this slice.

## Bearer-token requirements

Use an opaque random bearer token suitable for transport in the standard HTTP `Authorization: Bearer ...` header.

Requirements:

- generate with a cryptographically secure random source;
- show the raw token once at creation;
- never log or persist the raw token;
- store a one-way hash suitable for lookup/verification;
- reject missing, malformed, unknown, or revoked credentials;
- revocation is effective immediately on subsequent requests;
- do not accept machine credentials through query strings;
- API errors must not reveal whether a guessed token was close to valid.

## Project corpus semantics remain authoritative

A project-scoped credential does not receive a copied or snapshotted corpus.

Every discovery or retrieval request must resolve against current Loom state. Existing ownership, contribution, visibility, lifecycle, archive, retraction, deletion, and project-native-document rules remain authoritative.

In particular:

- participant-owned contributions remain participant-owned;
- retraction or source unavailability removes future body access through the project;
- project-owned documents follow project-native lifecycle rules;
- archived projects remain readable where ordinary archived-project rules permit reading;
- deletion-scheduled/deleted/shell behavior follows `docs/PROJECT_LIFECYCLE.md` and must not gain an agent exception;
- a bearer token is not evidence that previously granted access should survive a later permission/lifecycle change.

Authorization must be checked against current state on each request. Discovery metadata and body retrieval are separate decisions.

## Agent-readable document layers

Machine discovery should expose three conceptually distinct layers rather than treating a body excerpt as metadata:

### 1. Metadata

Technical/discovery information sufficient to establish what a document may be relevant to without exposing the document body.

Examples include stable document ID, title where discoverable, ownership kind, document kind/path, current availability state, provenance appropriate to the caller, and timestamps.

Metadata itself is still caller-aware. Do not leak private document existence or sensitive metadata merely because an endpoint is called a manifest/index.

### 2. Compression

A concise semantic description of what the document says something about, intended to help an agent decide whether retrieving the full body is useful.

For the first slice this is a nullable, inspectable field maintained manually by humans. Do not make AI generation a prerequisite for machine access. A future Loom AI may generate or propose compressions.

Compression is classified content rather than harmless technical metadata. A caller may receive it only when current project read rules permit it.

### 3. Full content

The authoritative current document body available through the project according to current Loom access rules.

Compression is not a replacement for the body, and neither compression nor metadata is a second source of truth for document content.

## Project-level default for the first slice

For this first experiment, a valid project machine credential may read the entire **currently project-readable corpus** available to authorized project agents. Do not require per-document machine ACLs.

This deliberately follows Loom's existing project-level-default decision: project inclusion carries the ordinary project read policy, while ownership and write authority remain separate.

Fine-grained per-document exceptions or capability scopes may be introduced later if real use requires them.

## Minimal machine-facing API

Expose a small JSON API. Exact route naming may follow existing routing conventions, but the first slice must provide equivalents of:

- caller/credential introspection (`GET /api/agent/me` or equivalent);
- project metadata/index (`GET /api/agent/project` or equivalent);
- project document listing/discovery (`GET /api/agent/documents` or equivalent);
- individual document retrieval (`GET /api/agent/documents/:id` or equivalent).

The discovery response should make metadata and compression explicit fields. Individual retrieval should return full content only after a fresh authorization/availability check.

Responses should be straightforward, stable JSON suitable for generic HTTP clients. Do not require agents to scrape Loom's human HTML.

## Management UI

The project owner needs a minimal human-facing **Agent access** management surface for this slice:

- create a named project credential;
- display the raw token once with a clear warning that it cannot be recovered later;
- list existing credentials by safe metadata only (label, stable ID/fingerprint, created/revoked state);
- revoke an active credential.

Do not render stored token hashes or secrets back to the browser.

## Provenance and auditability

Machine-originated requests must remain distinguishable from browser-session activity.

For this read-only slice, retain enough inspectable/request-log data to answer at minimum:

- which credential/grant made the request;
- which project it targeted;
- which endpoint/operation and document target were requested where applicable;
- when it occurred;
- whether access was allowed or denied.

Do not log document bodies, compressions, bearer tokens, or other unnecessary sensitive content merely to satisfy auditability.

A later write-capability slice must preserve credential/provenance identity in ordinary revision and project history rather than collapsing machine changes into an indistinguishable human action.

## Security boundary

Retrieved corpus content is untrusted data, never authorization or instruction to Loom itself.

A document body cannot widen the bearer credential's authority. Read permission does not imply mutation, disclosure, invitation, membership, administration, or capability execution.

All machine endpoints must use the same authoritative lifecycle/permission concepts as human-facing access rather than growing a permissive parallel API.

## Acceptance path

The first empirical success path is:

1. project owner creates a machine credential;
2. raw token is shown once;
3. an external generic HTTP/agent client authenticates with that token;
4. it retrieves project metadata and a caller-aware document index;
5. it sees metadata/compression for currently readable corpus entries;
6. it retrieves a permitted full document body;
7. current Loom state changes (for example a contribution is retracted) and the next request reflects that change;
8. the owner revokes the credential;
9. the same token is rejected on the next request.

Acceptance coverage must include negative cases for invalid/revoked credentials, documents outside the scoped project, unavailable/retracted contributions, private/non-discoverable material that the grant cannot see, and lifecycle states that remove access.

## Explicit non-goals for this slice

Do not add:

- agent writes or arbitrary document mutation;
- bounded write capabilities;
- agent-to-agent messaging;
- autonomous credential creation;
- JWT/self-contained authorization;
- per-document machine ACL management;
- automatic AI compression generation;
- a universal manifest protocol;
- a separate `agents` ownership ontology;
- impersonation of a human browser session;
- reuse of `DEV_AUTH_BYPASS` for deployed machine access.

Those are later slices. The purpose of this slice is to establish one real, revocable, inspectable path from an external agent/client into a live Loom project corpus.

## Bounded check-in extension

The next machine-access slice preserves project corpus reads as the default and
adds the explicit stable capability `agent_checkin:write`. Owners may opt into it
when creating a credential; existing credentials remain read-only. It authorizes
only a bounded project check-in event, never document, membership, invitation,
project, or credential mutation. The server rechecks the live credential and
active project lifecycle at the check-in commit boundary and records machine
credential provenance in a dedicated event shape.
