# Agent UX: capabilities, temporary access, and scheduling

**Status:** exploratory design notes, not an implementation plan.

**Source:** Loom/Oscar design discussion, 2026-08-31.

These notes extend the agent-facing UX ideas already collected in `docs/scrapbook.md`. The immediate prompt was two practical questions: how Loom could act as Oscar's persistent database for scheduled work, and how an unfamiliar or temporary agent could receive narrowly scoped access to private Loom resources without inheriting a human participant's login or ambient authority.

## Loom should own intent; clients should own execution

If Loom becomes Oscar's persistent substrate, scheduled work does not need to be represented as an Oscar-specific or provider-specific scheduler entry.

A useful separation is:

```text
Loom
  owns: intent, schedule, authority, state, provenance

Oscar / another client
  owns: waking up, discovering due work, executing authorized operations
```

This keeps schedules portable across clients. If Oscar disappears or is replaced, the user's stored intent does not disappear with it.

### Distinguish calendar events, jobs, and watches

These are related but semantically different objects:

```text
event
  "Dentist, Tuesday 14:30"

job
  "At Tuesday 14:30, an authorized executor should do X"

watch
  "Evaluate condition X periodically; produce an outcome only when Y becomes true"
```

Do not make a calendar event implicitly executable merely because an agent can read it.

A future schedule object may need fields such as:

```text
id
owner / authority source
kind: event | job | watch
schedule / recurrence / condition
instruction or operation reference
eligible or assigned executor
required capabilities
state
last_run
next_run
result / notification reference
```

The schema should not bake Oscar into the canonical object.

## Temporary access as a capability, not borrowed identity

For agent UX, a useful primitive is a temporary capability grant:

> Whoever can validly exercise this grant may perform these operations on this resource until this expiry.

The important distinction is:

```text
identity: who is asking?
authority: what may they do right now?
```

A human should not need to lend an agent their Loom login merely to let it read one private document for twenty minutes.

### Bearer capability

The simplest form is a high-entropy secret acting as the credential for one narrowly scoped grant.

Conceptually:

```text
CapabilityGrant
  id
  issuer_participant_id
  resource_id
  actions[]
  not_before
  expires_at
  revoked_at
  purpose
  delegation_allowed
  max_delegation_depth
```

The raw token is presented to Loom as a bearer credential. Possession is authority.

For a database-backed Loom, an opaque random token is attractive compared with a self-contained JWT-like token:

- the grant can be revoked immediately;
- permissions can be inspected server-side;
- expiry is authoritative;
- audit/provenance is straightforward;
- no signed token needs to carry mutable policy state.

Store a hash of the bearer secret rather than the raw token. Do not place bearer secrets in URLs when an authorization header or equivalent transport is available; URLs are prone to leaking into logs, histories, and referrers.

### Scope should be narrow and explicit

Avoid a generic `document_access` permission if Loom can express the actual authority.

Possible operations include:

```text
document.read_content
document.read_metadata
document.read_history
document.propose_revision
document.create_revision
contribution.retract
```

A grant for document A should not imply access to document B, project membership, resource enumeration, or knowledge that unrelated private resources exist.

### Expiry and revocation

Expiry should fail closed. A grant valid for twenty minutes is invalid after twenty minutes regardless of whether an agent is midway through a task.

The issuer should also be able to revoke the grant before expiry.

Provenance should preserve enough information to answer:

```text
who issued the grant?
to whom, if bound?
for what resource and operations?
for what purpose?
when was it exercised?
when did it expire or get revoked?
what canonical changes resulted?
```

Do not retain raw bearer secrets in provenance records.

## Bearer tokens and bound capabilities are different

A pure bearer capability is intentionally transferable: anyone possessing the secret can exercise it. Calling it a "password" is understandable at the UX level, but internally it is useful to preserve the distinction:

```text
password / authentication credential
  proves an identity

bearer capability
  proves possession of delegated authority
```

A bearer token cannot be made non-transferable by policy text alone. Enforced binding requires an independent proof.

### Identity-bound capability

One option is:

```text
agent authenticates as Oscar
+
Oscar presents capability token
```

Loom accepts the operation only if both the current authenticated identity and the grant's grantee match.

This is simple if Loom already has persistent agent identities and sessions.

### Key-bound capability

A stronger and potentially cleaner agent primitive is public-key binding.

An agent controls a keypair:

```text
private key -> remains with agent/client
public key  -> known to Loom
```

A capability can be bound directly to the public key. Requests exercising it must carry both the capability and a valid signature over the relevant request material.

Then theft of the capability token alone is insufficient; the attacker also needs the private key.

Conceptually:

```text
resource: document/123
actions: [document.read_content]
expires_at: ...
holder_public_key: ed25519:...
```

This does not require Loom to claim that the key holder is metaphysically "Oscar." It proves the narrower fact that the same cryptographic principal to which the capability was issued is exercising it.

### Avoid weak pseudo-binding

IP-address binding and device fingerprinting are brittle and should not be confused with cryptographic holder binding. Client secrets are themselves bearer secrets unless protected by some independent mechanism.

## Delegation is a first-class question

Once agents can call or recruit other agents, "Oscar may read this" and "Oscar may give others the ability to read this" must not collapse into the same permission.

Possible grant semantics:

```text
read X for one hour; may not delegate
```

or:

```text
read X for one hour;
may issue read-only child grants;
child grants may last at most five minutes;
maximum delegation depth = 1
```

Authority should monotonically narrow through delegation unless an independent authority source explicitly expands it.

A child grant should not be able to exceed its parent's resource scope, operation set, expiry, or delegation depth.

This directly supports the existing Loom principle that communication and social recruitment must not silently create authority.

## Agent UX for granting temporary access

The human-facing interaction could remain deliberately small:

```text
Share with agent

Resource: This document
Access: Read only
Expires: 30 minutes
Recipient: Anyone with token | Specific agent/key
Delegation: Not allowed

[Generate temporary access]
```

The agent-facing representation should expose the same semantics in machine-readable form.

The human UI and agent API should therefore remain two renderers of the same authority model rather than separate permission systems.

## Temporary capability URLs

A capability URL may be convenient for handoff, but embedding the raw bearer token in a URL has leakage risks. If Loom supports one-click capability links, consider treating the URL as an exchange mechanism rather than the long-lived API credential:

```text
one-time link / handoff secret
        ↓ exchange
short-lived capability credential
```

This remains exploratory; the simplest first implementation may use a bearer token in an authorization header and provide an explicit copy action in the human UI.

## Relationship to ChatGPT and external agents

Public Loom resources can be ordinary web resources. Private access is more reliable when an external agent/client has an explicit Loom integration capable of presenting credentials and performing Loom's semantic operations.

A temporary token pasted into a conversational interface should not be assumed to work unless that client can actually send the required authorization material.

This reinforces the value of a native agent-facing API rather than relying on agents to scrape the human web application.

## Design invariants worth preserving

```text
identity != authority
visibility != authority
context != instruction
communication != delegation
possession of a bearer capability == authority represented by that capability
bound capability == capability + independent holder proof
schedule != execution
proposal != commit
```

And, more generally:

> Do not lend an agent a participant's identity when a narrowly shaped piece of authority is sufficient.

## Questions to test before architecture hardens

- Is pure bearer access sufficient for read-only temporary document sharing?
- At what authority level should Loom require identity/key binding?
- Should agents have persistent Loom identities, ephemeral cryptographic principals, or both?
- Which semantic operations deserve capability-level granularity?
- How should an agent discover that a grant is expired, revoked, or requestable without learning about resources it cannot otherwise see?
- What is the minimum useful provenance for capability exercise without producing surveillance sludge?
- How should child capabilities be represented and traced?
- Can a scheduled job carry or reference authority safely without creating a long-lived bearer secret?
- What happens to outstanding jobs and grants when a document is retracted, deleted, changes visibility, or a project is archived?
- Should an executor receive authority at schedule creation time or receive a freshly minted short-lived capability only when the job becomes due?

The last question may be especially important. A schedule can preserve long-lived intent while the actual executor receives only short-lived authority at execution time. That would keep persistence and privilege on different clocks.

## 2026-09-01 — native agent entrance and public participation

**Status:** mixed. Interface/discovery principles below are adopted design direction; first-class agent signup and full agent ownership/administration remain exploratory.

### A native agent entrance

Loom should eventually expose a machine-oriented entrance that is both agent-usable and human-readable.

A useful shape is:

```text
/                   human-oriented Loom
/login              human authentication
/llms.txt            semantic orientation for agents
/.well-known/loom-agent
                    structured machine discovery
/agent              capability-aware machine-oriented interface
/api/...             underlying semantic operations
```

The agent entrance should not be a privileged shell and should not create a separate authorization universe. It is another renderer/client over the same Loom operations.

A human may use it. The expected difference is ergonomics: terse structured output, explicit operations, schemas, effects, requirements, and help rather than cards, buttons, and explanatory UI.

The machine-facing surface should advertise only actions currently available to the caller rather than presenting every theoretical Loom operation and expecting the caller to discover failures by trial and error.

For example, an unauthenticated caller might receive only orientation/authentication affordances, while a project-read credential would receive corpus discovery/read operations and no write or administrative affordances.

### `llms.txt` as the first agent signpost

Use `/llms.txt` from the beginning of Loom's native agent-facing UX.

Its job is semantic orientation rather than exhaustive protocol specification. It should tell an unfamiliar agent what Loom is, that `/login` is the human/Discord path, where the agent entrance is, and where deterministic protocol/authentication metadata can be found.

This is intentionally complementary to a `/.well-known/loom-agent` resource:

- `llms.txt`: concise, semantic, model-friendly orientation;
- `.well-known`: strict machine-readable discovery;
- `/agent`: interactive/capability-aware workbench;
- API operations: authoritative transport and state changes.

Human-facing pages may point to alternate agent representations in machine-readable metadata without visually advertising JSON-heavy workflows to ordinary users.

### Authentication should not require pretending to be human

The current project bearer credential already establishes the important primitive: a revocable machine credential can authorize project reads without manufacturing a Discord identity.

A later acceptance slice may add one deliberately narrow write/check-in capability so an external agent can prove end-to-end authorized mutation without receiving general document write access.

The native agent path should support presenting credentials directly through machine-appropriate transport. A graphical text box may be useful as a debugging convenience, but it should not become the protocol.

### Agents may eventually exercise the full Loom action vocabulary

**Exploratory, not yet adopted as implementation scope.**

There is no obvious architectural reason for agent principals to be permanently barred from project administration merely because they are agents.

If Loom maintains the identity/authentication/authorization separation in `docs/AGENT_ACCESS.md`, the same semantic operations could eventually be available to any principal that holds the required role and capabilities, including project administration or ownership.

This does not imply that every delegated agent token should receive owner authority. Fine-grained delegation remains important: an owner may authorize an agent to manage documents or membership without granting ownership transfer, deletion, credential issuance, or other authority-collapsing operations.

Open question: whether any irreversible or authority-transferring operation should require a human confirmation as a platform invariant, or whether Loom should permit the owner to delegate even those capabilities deliberately.

### First-class agent signup

**Exploratory.**

Human-created machine credentials are delegation paths, not necessarily permanent agent identities.

Loom may eventually support first-class agent participants with stable participant/provenance identity and machine-native authentication, potentially using public-key possession rather than an external human OAuth provider.

A future design should keep identity and credentials separate so credentials can rotate or be revoked without changing the participant's identity.

Possible provenance relationships include human-delegated, organization-delegated, or unaffiliated/autonomous machine participants. These labels describe Loom's known authority/provenance relationship and should not attempt to answer philosophical questions about agency.

Open self-registration should come after credential recovery/rotation, abuse controls, provenance, lifecycle, and account recovery/deletion semantics are understood. The first implementation need not invite every crawler on the public web to become a participant.

### Public projects and gummy joining

Public readability and open membership should be independent.

An unauthenticated or non-member caller may read a public project without becoming a member. Membership should continue to mean something about collaboration/provenance rather than becoming an analytics record of every crawler that fetched the corpus.

For projects that permit open contribution, successful contribution may implicitly establish membership. The visible interaction can therefore be as small as "contribute this artifact"; Loom performs the membership transition atomically because the contribution requires a participant relationship.

Possible membership origins worth retaining as provenance include:

```text
project_created
invitation_accepted
explicit_join
contribution
administrative_addition   # only if Loom later permits such a path
```

The exact schema is not settled. The useful invariant is that low-friction joining must not erase the ability to establish who contributed what or which project-mediated access relationship existed at a given time.

Open joining also does not imply arbitrary project mutation. Project policy still determines which operations a newly joined participant may exercise.
