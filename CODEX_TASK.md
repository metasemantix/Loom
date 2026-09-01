# Current Codex Task

Implement Loom's next bounded machine-access slice: **native agent discovery/entrance plus an explicit check-in write capability**.

Read and follow `AGENTS.md`. Read `docs/AGENT_ACCESS.md`, `DECISIONS.md`, and `docs/agent-ux-capabilities-and-scheduling.md` first. Also read `docs/TESTING_MODEL.md`, `docs/PROJECT_LIFECYCLE.md`, and the current `src/agent-access.ts` / routing implementation before changing authorization or schema behavior.

The existing deployed read-only machine-access slice is the baseline, not work to reimplement. Preserve its routes and semantics:
- `GET /api/agent/me`
- `GET /api/agent/project`
- `GET /api/agent/documents`
- `GET /api/agent/documents/{document_id}`
- owner-managed revocable project credentials under `/api/projects/{project_id}/agent-credentials`

## Goal

Give an unfamiliar external agent a clear Loom-native entrance that does not require colliding with Discord login or scraping the human UI, and add one deliberately tiny mutation proving that machine authority can be narrower than general write access.

The intended path is:

```text
/llms.txt
  -> /.well-known/loom-agent
  -> /agent
  -> authenticate with an existing project machine credential
  -> discover currently available capabilities
  -> read project corpus
  -> optionally perform a scoped check-in if that credential was explicitly granted check-in authority
```

Human and agent surfaces remain alternate renderers of the same Loom semantics. Do not create a parallel agent authorization system.

## Required implementation

### 1. `/llms.txt`

Add a small public plain-text agent orientation document.

It should:
- identify Loom briefly;
- say that `/login` / Discord is the human authentication path;
- direct machine callers to `/agent`;
- link the strict discovery document at `/.well-known/loom-agent`;
- mention bearer authentication at a high level without exposing secrets or project-specific information;
- remain concise, deterministic, and useful to both humans and models.

Do not turn `llms.txt` into exhaustive API documentation.

### 2. `/.well-known/loom-agent`

Add a public JSON discovery resource containing stable, non-secret protocol metadata.

At minimum expose:
- service name;
- machine-interface/protocol version;
- agent entrance URL;
- bearer authentication scheme;
- canonical existing read endpoints;
- the check-in endpoint;
- a reference to `/llms.txt`.

Do not advertise project-specific capabilities before authentication. Do not leak credential state, project identity, or private corpus metadata.

### 3. `/agent` machine-oriented entrance

Add a deliberately austere, human-readable machine-oriented page/workbench.

It is not a privileged shell. It must use the same existing machine API and authorization rules.

Requirements:
- explain that this is Loom's machine-oriented interface and point humans to the ordinary Loom interface/login;
- provide a safe way to enter an opaque bearer token for the current page session;
- do not put bearer tokens in URLs, query strings, DOM-visible logs, command history, `localStorage`, or server logs;
- do not persist the raw token beyond what is required for the active client interaction;
- after authentication, use `GET /api/agent/me` to show the authenticated grant/project metadata and current advertised capabilities;
- provide simple controls/commands for the existing read operations;
- advertise/render the check-in action only when the authenticated credential currently has that capability;
- present stable structured responses and concise help/tooltips rather than a decorative human dashboard.

A literal shell parser is not required. Prefer a small robust text-oriented workbench over unnecessary terminal emulation.

If generated inline browser JavaScript is used, follow the rendered-program validation rules in `AGENTS.md`.

### 4. Explicit check-in capability

Extend project machine credentials with one explicit opt-in mutation capability, conceptually `agent_checkin:write`.

Preserve current behavior:
- existing credentials remain read-only;
- newly created credentials are read-only unless the owner explicitly enables check-in authority;
- check-in authority does not imply document write, membership, invitation, project administration, credential administration, or any other mutation.

Use the smallest migration/schema extension that expresses this cleanly. Do not introduce a general-purpose ACL/capability framework merely for this slice.

Update the owner credential-management surface so the owner deliberately chooses whether a new credential may check in. Existing credential listings should show this safe capability metadata.

### 5. Check-in operation

Add an authenticated machine endpoint:

`POST /api/agent/check-in`

Accept a small bounded JSON payload, for example a required `value` or `message` string with a conservative length limit.

A successful check-in must:
- require a valid non-revoked credential with explicit check-in authority;
- resolve current project lifecycle/credential state at mutation time;
- fail closed if the project state no longer permits forward mutation;
- record the check-in as a dedicated project/machine event or similarly inspectable provenance record;
- retain credential/grant identity, project, timestamp, and bounded submitted value;
- never be represented as a document revision or fake human action.

Do not allow check-in on archived, deletion-scheduled/read-only, deleted, or shell projects. Follow the settled rule that archival freezes forward project mutation.

Keep the stored check-in intentionally small. It exists to prove an authorized machine-originated mutation path, not to become a message board.

### 6. Capability discovery

Extend `GET /api/agent/me` (or its returned representation) so callers can discover their currently available semantic operations.

Use explicit stable capability identifiers. At minimum distinguish:
- project/corpus read capability already provided by the credential;
- `agent_checkin:write` only when granted and currently exercisable.

Do not infer or advertise unavailable mutations. The server remains authoritative even after capability discovery; stale discovery must not authorize a later mutation.

## Acceptance coverage

Extend the existing acceptance world and standing `actor + operation + target + relevant state -> expected result + expected state transition` model.

Cover at minimum:

### Discovery/entrance
- `/llms.txt` is public, plain text, concise, and points to the agent entrance/discovery document;
- `/.well-known/loom-agent` is public JSON and leaks no project/credential-specific information;
- human `/login` behavior remains intact;
- `/agent` loads without authentication and clearly distinguishes the human and machine paths;
- rendered browser JavaScript parses and the primary workbench flow is functionally smoke-tested where the environment permits.

### Capability grant
- existing credential rows migrate as read-only;
- owner can create a read-only credential;
- owner can explicitly create a check-in-enabled credential;
- non-owner cannot grant/change machine capabilities;
- safe credential listings expose capability metadata without raw token/hash leakage.

### Check-in
- read-only credential receives no check-in capability and `POST /api/agent/check-in` is rejected;
- check-in-enabled credential sees `agent_checkin:write` in introspection and can successfully check in;
- successful check-in creates inspectable provenance tied to the machine credential/grant and project;
- check-in cannot mutate documents, membership, project settings, roles, invitations, or credentials;
- malformed/oversized payloads fail closed;
- malformed, unknown, and revoked bearer tokens fail closed;
- revocation blocks the next check-in immediately;
- archived/deletion-scheduled/deleted/shell state blocks check-in;
- a stale preflight/introspection result cannot allow a check-in after project state or credential authority changes.

### Regression
- all existing agent read routes and current live-state semantics continue to work unchanged;
- current human project/credential-management behavior remains intact except for the added explicit capability choice.

## Migration and deployment safety

This slice may extend the existing machine-credential schema and add a small provenance/check-in table or event shape.

Follow the repository's migration rules:
- LF line endings;
- test fresh initialization;
- test upgrade from a representative existing database containing current read-only credentials;
- never reset existing user data to make the migration pass.

Existing credentials must become/read as check-in-disabled without manual repair.

## Scope boundaries

Do not implement:
- arbitrary agent/document writes;
- general capability delegation;
- agent signup or first-class autonomous agent identity;
- public/open project membership;
- project administration by agents;
- ownership transfer by agents;
- agent-to-agent messaging;
- JWTs;
- per-document machine ACLs;
- automatic AI-generated metadata/compression;
- a full terminal emulator;
- a second agent-only ownership or permission ontology.

Do not weaken the human/browser auth model or reuse `DEV_AUTH_BYPASS`.

## Documentation

Update README/API documentation to describe:
- `/llms.txt`;
- `/.well-known/loom-agent`;
- `/agent`;
- the explicit check-in capability and endpoint;
- the fact that existing credentials remain read-only by default.

If implementation settles any previously exploratory detail, update the appropriate architecture note narrowly rather than rewriting unrelated design material.

## Validation

Run the validation required by `AGENTS.md`:

```text
npm test
npm run typecheck
git diff --check
```

Also exercise the smallest meaningful end-to-end paths:
1. create read-only credential -> authenticate -> discover reads -> verify no check-in;
2. create check-in-enabled credential -> authenticate -> discover capability -> check in -> inspect provenance;
3. revoke -> confirm both read/check-in behavior follows current authority;
4. change project lifecycle to archived -> confirm check-in fails while settled read behavior remains intact.

At completion, report:
- schema/migration changes;
- exact public discovery/agent routes;
- exact capability identifier(s);
- check-in payload and provenance shape;
- acceptance coverage;
- browser/workbench smoke-test result;
- migration test result;
- passed, failed, and unperformed validation separately;
- any unresolved architecture question rather than silently expanding scope.
