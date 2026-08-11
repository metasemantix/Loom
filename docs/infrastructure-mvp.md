# Loom Infrastructure MVP — Get the Corpse Floating

This document defines the smallest useful Loom substrate.

It is deliberately boring. No model runs in the backend. No semantic memory. No matching algorithm. No autonomous coordinator. The MVP only establishes a place that humans can use normally and authorized agents can read and write through bounded interfaces.

The first job is to replace this workflow:

```text
shared document
  ↓
human downloads corpus
  ↓
human uploads corpus to agent
  ↓
agent produces result
  ↓
human manually carries result back
```

with this:

```text
Loom
 ├── human web UI
 └── agent-readable interface

same canonical data underneath
```

The infrastructure exists if a participant can sign in, maintain their own space, join an experiment, authorize an agent, and let that agent read the experiment corpus or write into explicitly permitted areas without manual file shuffling.

---

## 1. Hard boundaries

The MVP has these sharp edges.

### No AI in the backend

Loom stores, serves, validates, authorizes, versions, and records provenance.

It does not:

- summarize participant material;
- infer profiles;
- generate matches;
- choose what is important;
- rewrite canonical documents;
- run embeddings or vector search;
- decide whether an agent output is true.

AI lives outside Loom. Agents are clients of the infrastructure.

### No Git as the personal-data store

Git is excellent project plumbing and poor user-data semantics.

Personal material must support:

- scoped ownership;
- bounded writes;
- ordinary editing;
- revocation;
- withdrawal;
- deletion according to policy;
- version history that Loom controls rather than immortalizes accidentally.

The repository contains Loom's code and project documentation. Participant data lives in the application datastore.

### No arbitrary shared write access

Nobody receives permission to "edit the corpus."

Every write targets an object whose ownership and allowed operation are known server-side.

The client never gets to establish authority by supplying a path or participant name.

### No model-owned canonical truth

An agent may write into an explicitly agent-writable area or submit a proposal.

It may not silently rewrite human-authoritative material.

---

## 2. Two surfaces, one substrate

Loom has a human surface and an agent surface.

```text
              ┌──────────────────┐
              │      Loom        │
              │ canonical state  │
              └────────┬─────────┘
                       │
             ┌─────────┴─────────┐
             │                   │
             ▼                   ▼
       Human web UI        Agent interface
       browser/forms       HTTP API + stable
                           Markdown/JSON reads
```

Humans should never need to use an API or console.

Agents should never need to click through the website.

---

## 3. Human UI

The initial UI contains only four useful areas.

### Sign in

MVP authentication uses Discord OAuth because the initial participant pool already exists there.

Discord identity is an authentication method, not the Loom identity itself.

Loom creates its own stable internal user ID and maps the Discord account to it.

```text
Discord account
      ↓
auth_identity
      ↓
Loom user ID
```

The data model must allow additional login identities later without changing the Loom user ID.

### My space

A participant can:

- view their own space;
- edit human-authoritative documents;
- add or remove documents;
- inspect current published material;
- view revision history;
- review agent proposals;
- manage connected agents;
- withdraw from an experiment.

The UI may present the space as folders even if storage is relational underneath.

Example logical namespace:

```text
participants/{participant_id}/
  profile/
  introductions/
  documents/
  agent-output/
  proposals/
```

One participant owns the whole namespace. Different subtrees have different write rules.

### Experiment

An experiment page exposes:

- experiment description;
- membership state;
- current participant corpus;
- experiment-owned documents;
- participant contributions permitted by that experiment.

For the first use case, this is enough to host a *Meet My Human*-style introduction corpus without Google Docs download/upload choreography.

### Agent access

A participant can create and revoke an agent credential.

The UI must show plainly what each agent can do.

Example:

```text
Daisy

Can:
✓ read public experiment material
✓ read Bee's participant space
✓ write Bee's agent-output area
✓ submit proposals for Bee

Cannot:
✗ directly rewrite Bee's profile
✗ edit another participant
✗ change experiment structure

[Revoke]
```

---

## 4. Identity and ownership

Display names and slugs are not identity.

Use stable opaque internal IDs.

```text
user_id        usr_...
participant_id par_...
agent_id       agt_...
experiment_id  exp_...
document_id    doc_...
```

A participant may change their public name without moving or re-keying their data.

Ownership is attached to IDs server-side.

Conceptually:

```text
user usr_A
  owns
participant par_A
  owns namespace
participants/par_A/**
```

The browser never sends "I am par_A" as proof of identity. It sends a valid authenticated session; the backend resolves the participant and authority itself.

---

## 5. Authentication

### Human authentication

MVP:

```text
Continue with Discord
        ↓
Discord OAuth callback
        ↓
lookup auth_identity(provider=discord, provider_user_id=...)
        ↓
resolve/create Loom user
        ↓
create Loom session
```

Store the provider's stable user identifier, not a Discord username.

Later, the same Loom user may attach email, GitHub, another OAuth provider, or other login methods.

### Agent authentication

Agents do not receive the human's browser session.

A human creates an agent credential in Loom. Loom stores only a hash of the secret and returns the raw secret once.

Requests use:

```text
Authorization: Bearer <agent-token>
```

The token resolves to:

```text
agent_id
owner_user_id
scopes
created_at
expires_at    optional
revoked_at    optional
```

Revocation must take effect immediately.

---

## 6. Permission model

Keep the initial permission vocabulary tiny:

```text
read
write
propose
admin
```

Ordinary participant:

```text
read      experiment material allowed to members/public
write     own human-writable objects
propose   shared objects where proposals are accepted
admin     no
```

Participant agent:

```text
read      explicitly granted corpus + owner's permitted context
write     explicitly granted owner subtrees only
propose   owner's human-authoritative material
admin     no
```

Experiment organizer:

```text
read      experiment state
write     experiment-owned material
propose   n/a
admin     membership + experiment structure
```

### Server-side target resolution

Do not expose a generic endpoint like:

```text
POST /write?path=participants/tanja/...
```

Prefer bounded operations:

```text
PUT  /me/introduction
POST /me/documents
POST /me/agent-output
POST /me/proposals
```

or ID-based operations where the server verifies ownership before mutation.

The caller cannot escape its namespace by inventing a path.

---

## 7. Canonical data model

A minimal relational schema can begin with:

```text
users
  id
  display_name
  created_at

 auth_identities
  id
  user_id
  provider
  provider_user_id
  created_at

sessions
  id
  user_id
  expires_at

participants
  id
  user_id
  public_slug
  created_at
  withdrawn_at

experiments
  id
  slug
  title
  description
  created_by
  created_at

experiment_memberships
  experiment_id
  participant_id
  role
  status
  joined_at

 documents
  id
  owner_type       participant | experiment | system
  owner_id
  kind
  logical_path
  current_version_id
  visibility
  created_at
  deleted_at

 document_versions
  id
  document_id
  version_number
  content
  content_type     text/markdown | application/json | text/plain
  actor_type       human | agent | system
  actor_id
  created_at

agents
  id
  owner_user_id
  name
  created_at
  revoked_at

agent_tokens
  id
  agent_id
  secret_hash
  created_at
  expires_at
  revoked_at

agent_scopes
  agent_id
  scope
  resource_type
  resource_id
```

This is enough to support ownership, bounded agent access, editable documents, revision history, experiments, withdrawal, and provenance.

Do not add semantic memory tables until real use requires them.

---

## 8. Folder semantics without filesystem ownership

Participants should feel as though they own a folder:

```text
participants/par_A/
  profile/
  introductions/
  documents/
  agent-output/
  proposals/
```

But this is a logical namespace, not raw filesystem access.

`logical_path` gives documents human- and agent-readable organization while `owner_type`, `owner_id`, `kind`, and permissions remain authoritative.

The server constructs or validates logical paths. Ownership never depends on a string prefix supplied by the client.

Suggested initial rules:

- `profile/**` — human write; agent propose;
- `introductions/**` — human write; agent propose;
- `documents/**` — human write; agent write only when explicitly scoped;
- `agent-output/**` — scoped agent write;
- `proposals/**` — scoped agent create; human accept/reject.

---

## 9. Revision and provenance

Every accepted document mutation creates a new `document_versions` row.

The current document points at one version.

A version records who produced it:

```text
human usr_A
agent agt_B
system
```

This provides:

- history;
- attribution;
- diffability;
- rollback;
- auditability.

Unlike Git history, revision retention is application policy. Personal data can be removed when policy requires removal.

Agent proposals remain distinguishable from accepted human-authoritative state.

---

## 10. Agent-readable output

The datastore is canonical. Markdown and JSON are projections of it.

Agents should be able to retrieve stable resources such as:

```text
GET /participants/{id}/context.md
GET /participants/{id}/context.json
GET /experiments/{id}/corpus.md
GET /experiments/{id}/corpus.json
```

Only material visible to the requesting principal is included.

For genuinely public experiment material, the same resources may be readable without authentication.

The Markdown representation should be boring, explicit, and useful to models without requiring a Loom SDK.

Example corpus shape:

```markdown
# Meet My Human — Phase 3

## Participant par_01
Source: participant-authored
Updated: ...

...

## Participant par_02
Source: participant-authored
Updated: ...

...
```

JSON exists for structured clients. Markdown exists for humans and models that can simply read a URL.

---

## 11. Agent writes

The agent interface starts with a very small set of operations.

Examples:

```text
POST /api/me/agent-output
POST /api/me/proposals
GET  /api/experiments/{id}/corpus
GET  /api/me/context
```

An agent may submit:

- its own analysis artifact;
- a match result;
- a question set;
- experiment output;
- a proposed update to its human's canonical material.

The backend does not judge the intellectual quality of the output. It checks identity, scope, schema, size, and target.

---

## 12. Proposal flow

Human-authoritative material uses proposals rather than silent agent rewrites.

```text
agent notices candidate update
        ↓
POST proposal
        ↓
stored as proposal
        ↓
human sees diff/reason/source
        ↓
accept | edit | reject
        ↓
accepted version becomes current
```

The proposal should preserve:

- proposing agent;
- target document;
- proposed content or patch;
- optional reason;
- optional source/reference;
- creation time;
- decision and decision time.

No hidden inference becomes canonical merely because a model produced it confidently.

---

## 13. Withdrawal and deletion

Withdrawal is part of the MVP, not a future privacy feature.

At minimum a participant must be able to:

```text
leave experiment
hide current participant material
revoke every agent token
request/delete participant material according to policy
```

The public corpus must stop serving withdrawn material immediately when required by the experiment policy.

Do not rely on immutable repository history for personal-data retention.

---

## 14. Suggested implementation shape

The existing Loom direction fits a small Cloudflare deployment:

```text
Browser
  ↓
static frontend
  ↓
Cloudflare Worker / API
  ↓
D1
```

Optional object storage can be added only when actual file uploads require it.

The first datastore can remain D1-only while content is text/Markdown/JSON.

The Worker handles:

- OAuth callback and Loom sessions;
- permission checks;
- CRUD operations;
- document revisions;
- agent-token authentication;
- corpus rendering;
- withdrawal/deletion operations.

No background AI service is required.

---

## 15. Minimum screens

Do not build a social network shell.

The MVP needs only:

```text
/login
/me
/experiments/{slug}
/settings/agents
```

`/me` may contain tabs or sections for documents, introduction, proposals, and history rather than separate routes.

The experiment page may contain the participant corpus directly.

---

## 16. Minimum API

Exact route names may change, but v0 needs the equivalent of:

```text
GET    /api/me
GET    /api/me/documents
POST   /api/me/documents
PUT    /api/me/documents/{id}
DELETE /api/me/documents/{id}
GET    /api/me/proposals
POST   /api/me/proposals
POST   /api/me/proposals/{id}/accept
POST   /api/me/proposals/{id}/reject

GET    /api/experiments/{id}
GET    /api/experiments/{id}/corpus
POST   /api/experiments/{id}/join
POST   /api/experiments/{id}/leave

GET    /api/me/agents
POST   /api/me/agents
DELETE /api/me/agents/{id}
```

Agent authentication can use the same read/write routes where practical. Authorization depends on the principal and scope, not on a completely separate agent backend.

---

## 17. What explicitly waits

Not in this infrastructure MVP:

- agent-to-agent messaging;
- matching logic;
- automatic context extraction;
- embeddings;
- semantic search;
- THREAD integration;
- GARAGE integration;
- shared relationship memory;
- feeds;
- reactions;
- direct messages;
- reputation;
- compatibility scores;
- automated moderation;
- autonomous infrastructure modification;
- MCP server;
- generalized plugin system;
- federation;
- decentralized identity.

Stable HTTP + Markdown/JSON is enough to test the substrate first.

---

## 18. First end-to-end success condition

The corpse floats when this works:

```text
1. Alice signs into Loom with Discord.
2. Loom creates/resolves Alice's internal identity.
3. Alice joins an experiment.
4. Alice writes an introduction in the web UI.
5. Bob does the same.
6. Loom exposes the experiment corpus as a stable Markdown/JSON resource.
7. Alice creates a read-only credential for her agent.
8. Her agent reads the corpus directly from Loom.
9. The agent writes one result into Alice's agent-output area.
10. Alice sees that result in Loom.
11. Alice revokes the agent credential.
12. Further writes using it fail.
13. Alice edits or withdraws her introduction.
14. The served corpus immediately reflects the current allowed state.
```

Nothing in that path requires a human to download a corpus, upload it into an AI chat, copy the output into another platform, administer Git permissions, or trust an AI backend to maintain canonical state.

Once this works reliably, Loom has a substrate worth putting experiments on top of.
