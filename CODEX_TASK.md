# Current Codex Task

Implement the first bounded Loom machine/agent access slice: **revocable read-only project credentials and an agent-readable project corpus API**.

Read and follow `AGENTS.md`. Read `docs/AGENT_ACCESS.md` first; it is normative for this slice. Also read `DECISIONS.md`, `docs/PROJECT_LIFECYCLE.md`, `docs/CONTRIBUTION_LIFECYCLE.md`, `docs/PROJECT_NATIVE_DOCUMENTS.md`, and `docs/TESTING_MODEL.md` before changing authorization or schema behavior.

## Goal

Make the deployed Loom useful to an external generic agent/client without requiring a Discord browser session or scraping human HTML.

A project owner must be able to create a named, project-scoped machine credential, receive its opaque bearer token exactly once, and later revoke it. A caller presenting that token can discover and read the project's currently authorized corpus through a small JSON API. Current Loom ownership, contribution, visibility, and lifecycle state remain authoritative on every request.

Do not create a separate agent species or `is_agent` authorization path. Identity/provenance, authentication method, and authorization grant are separate concepts as defined in `docs/AGENT_ACCESS.md`.

## Required implementation

- Add the minimal schema/migration needed for project-scoped machine credentials/grants and read-request audit/provenance records.
- Store only a one-way token hash/fingerprint, never the recoverable raw bearer token.
- Generate bearer tokens with a cryptographically secure random source and return the raw token only in the successful creation response.
- Add owner-only project UI/API operations to create a named credential, list safe credential metadata, and revoke an active credential.
- Add bearer authentication for a small JSON machine API equivalent to:
  - caller/credential introspection;
  - project metadata/index;
  - project document discovery/listing;
  - individual document retrieval.
- Keep route naming consistent with the existing application where sensible; document the final routes.
- Add a nullable manual **compression** field/surface for documents as required by `docs/AGENT_ACCESS.md`. Compression is content-classified and follows read authorization; it is not public technical metadata merely because it is short.
- Discovery responses must distinguish technical/discovery metadata, nullable compression, and full-content retrieval rather than embedding body excerpts as metadata.
- Resolve every discovery/retrieval request against current project/document state. Do not snapshot/copy corpus content into credential records.
- Preserve participant-owned contribution semantics, project-native ownership, `agent_only` behavior, archive/deletion rules, retraction, source deletion, and current project read policy.
- Record safe read-request audit/provenance data sufficient to identify credential/grant, project, operation/target, timestamp, and allowed/denied result without logging bearer tokens or document content.
- Revocation must take effect on the next request.
- Machine endpoints are read-only in this slice. Reject or omit mutation capabilities rather than quietly inheriting browser-session mutation routes.

## Acceptance coverage

Extend the stable acceptance model rather than creating an unrelated test universe. Cover at minimum:

- owner creates credential and raw token is returned once;
- non-owner cannot create/revoke project credentials;
- stored database state cannot recover the raw token;
- valid bearer credential can introspect its project grant;
- valid credential can discover the currently authorized project corpus;
- valid credential can retrieve an authorized participant-owned contribution;
- valid credential can retrieve an authorized project-native document;
- metadata/compression/full-content boundaries follow current access rules;
- a document outside the scoped project cannot be retrieved through the credential;
- retraction/source unavailability is reflected on the next request;
- archived-project reads follow settled archived-project semantics;
- deletion-scheduled/deleted/shell states do not gain special machine access;
- malformed, unknown, and revoked tokens fail closed;
- revocation is immediate for subsequent requests;
- audit records identify the credential/project/operation/result without storing secrets or body content.

Use the standing `actor + operation + target + relevant state -> expected result + expected state transition` model from `docs/TESTING_MODEL.md`.

## Migration and deployment safety

This slice will add a production migration. Follow the repository's LF line-ending rule for migration SQL; the first production deployment exposed Wrangler/D1 failures on CRLF trigger migrations.

Test the migration on both a fresh database and a representative existing database state. Never reset existing user data to make the migration pass.

## Scope boundaries

Do not implement agent writes, bounded mutation capabilities, agent-to-agent messaging, autonomous delegation, per-document machine ACLs, JWTs, AI-generated compressions, custom domains, CI/CD, or a separate agent ownership ontology.

Do not reuse `DEV_AUTH_BYPASS` as machine authentication. Do not weaken existing human/browser authorization to make the machine API convenient.

## Validation

Run all validation required by `AGENTS.md`, including acceptance tests, typecheck, `git diff --check`, and the smallest meaningful rendered/browser smoke test for the credential management UI where the environment permits it.

Also exercise the machine API end-to-end with a generated credential using a generic HTTP client in the test environment: create -> authenticate -> discover -> retrieve -> change source/project state -> observe updated access -> revoke -> confirm rejection.

At completion, report the schema/API/UI changes, exact machine routes and authentication format, acceptance coverage, migration results, security-sensitive design choices, and any validation that could not be performed.