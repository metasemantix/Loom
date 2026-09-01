# Loom Idea Scrapbook

Ideas worth preserving before they deserve architecture.

This document is intentionally not an implementation plan. Entries may become principles, experiments, features, or dead ends. Keep the distinction between observations, hypotheses, and adopted design decisions explicit.

## Personalization by depersonalization

**Source:** discussion during Loom design, 2026-08-12.

A person should not need to become an amateur psychiatrist, neurologist, pharmacologist, disability lawyer, or other domain specialist merely to make their own repeated experience legible enough to be taken seriously.

One possible role for Loom is to preserve longitudinal evidence in a form that is portable, inspectable, attributable, and independent of whether the person presenting it is persuasive in the professional dialect.

Instead of reducing experience immediately to an expert category, preserve the underlying sequence:

```text
condition / intervention
    ↓
observation
    ↓
outcome
    ↓
person's own evaluation
    ↓
later observation
```

For example, a system might be able to retain observations such as:

```text
appointments before noon → repeatedly difficult
written communication → repeatedly successful
advance agenda → interaction becomes easier
intervention X → sleep changes
intervention Y → no useful effect
```

The point is not for Loom to diagnose why these relationships exist. Explanations can remain hypotheses and be revised or discarded while the observations survive.

```text
Observation:
A repeatedly co-occurs with B.

Hypothesis:
A causes B because of C.

Later evidence:
C appears false.

Result:
Discard or weaken the hypothesis; retain the observation.
```

This suggests a general-purpose substrate built from primitives such as:

- claims;
- observations;
- interventions or changed conditions;
- outcomes;
- provenance;
- uncertainty;
- permissions;
- revisions;
- explicit human preferences about the outcome.

Medicine is only one possible application. The same structure could support accessibility, education, work, communication, tool use, personal routines, collaboration, and other domains where a person's repeated experience is otherwise continually reconstructed from scratch.

The principle can be stated more generally:

> Systems should make expertise available without making institutional expertise the price of being legible.

This does **not** imply replacing domain expertise with personal observation. Population evidence, physiology, diagnostics, specialist knowledge, safety constraints, and external measurements can contribute information the individual cannot generate alone. The aim is to prevent those forms of evidence from automatically erasing the individual's longitudinal evidence.

In Loom terms, this is a possible consequence of portable context and provenance rather than a reason to put an AI expert in the backend. The canonical substrate can remain non-AI. Participating agents or humans may interpret the evidence, propose explanations, and compare it with outside knowledge, while interpretations remain distinguishable from the observations they are based on.

### Recursive improvement implication

If Loom can retain both outcomes and the conditions that produced them, personalization can become iterative without requiring a fixed model of the person:

```text
observe → hypothesize → try → observe → revise
```

The thing being recursively improved is not necessarily *the human* and not necessarily *the AI*. It may be the fit between a person, their tools, other people, and their environment.

## Agent execution as an explicit trust boundary

**Source:** examination of AIBB (`xlr8harder/aibb`) during Loom design, 2026-08-24.

AIBB provides useful prior art for running AI participants through a deliberately controlled harness rather than allowing an agent framework's ambient environment to determine what a model sees or can do.

Several ideas are worth preserving for Loom without yet adopting their particular implementation.

### Context manifests

An agent action could be associated with an inspectable description of the context made available for that action:

```text
agent session
├─ selected documents and revisions
├─ derived context or summaries
├─ explicit instructions
├─ available tools
├─ model/provider provenance
└─ authority available to the session
```

The important property is not necessarily storing every rendered prompt forever. It is being able to distinguish deliberately supplied context from ambient or accidental context and, where appropriate, reconstruct what information an action depended on.

This would complement Loom's existing retrieval model: a context packet should be deliberate rather than whatever happens to fit into an agent framework's environment.

### Data is not instruction

Retrieved documents, project material, external web content, and other participant-controlled information should enter an agent's context as **data**, not acquire authority merely by containing imperative text.

This does not solve prompt injection at the cognitive level: arbitrary information may still influence a model's reasoning. It instead establishes a harder system boundary:

> Context may influence reasoning. It should not determine authority.

The operations available to the agent remain independently constrained.

### Domain capabilities rather than substrate access

Agents should preferably receive operations corresponding to the task they are authorized to perform rather than generic access to Loom's storage primitives.

For example:

```text
shopping_list.add_item
shopping_list.toggle_item
```

may be preferable to:

```text
write_document
```

when an Oscar agent has been authorized only to maintain a shopping list.

Likewise, an agent participating in a project might receive the ability to propose a document revision without receiving arbitrary write access to the underlying document store.

This suggests that capability design may become one practical expression of intentionality.

### Intentionality and authority provenance

AIBB primarily constrains what a model may do during a controlled visit. Loom may need to preserve an additional question:

> Why does this agent have this authority?

A possible authority chain might include:

```text
human
  ↓ grants authority to
client
  ↓ delegates narrower authority to
agent session
  ↓ performs or proposes
operation
```

Potential properties of a grant include:

- authority source;
- recipient;
- target object or scope;
- permitted operations;
- purpose;
- duration or expiry;
- whether further delegation is allowed.

Authority should not silently expand as it is delegated.

This is exploratory. Loom does not yet need to commit to a particular capability-token or delegation mechanism.

### Proposal and commitment may be separate states

An agent deciding that a change should occur does not necessarily mean that the change has occurred.

A useful general sequence may be:

```text
agent proposes operation
        ↓
operation validated
        ↓
authority / intent checked
        ↓
commit automatically or request approval
        ↓
authoritative state changes
```

Low-risk, tightly bounded operations may be authorized for immediate commitment. Other operations may remain proposals until explicitly accepted.

This distinction could allow Loom to support increasing autonomy without requiring a binary choice between read-only agents and agents with unrestricted write access.

### Explicit incompleteness

An agent should be able to tell when retrieved information is incomplete.

If a project contains 63 relevant artifacts and a retrieval operation returns 20, the result should not silently resemble a complete project view. Pagination, truncation, filtering, snapshot boundaries, and other reasons for incompleteness should be represented explicitly.

This applies not only to agents. Any Loom client consuming structured retrieval may benefit from knowing whether it has received a complete result.

### Derived context is not canonical evidence

Summaries, compactions, extracted claims, embeddings, and other synthesized representations should remain distinguishable from their source material.

A compacted agent context may be useful without becoming equivalent to the canonical records from which it was produced.

Where consequential actions depend on derived context, provenance may need to retain enough information to identify the derivation and its source revisions.

### Snapshot-bound execution

Some operations may benefit from binding an agent session to a known Loom state or set of document revisions.

This avoids pretending that an agent reasoned over a single coherent state when the underlying project changed during its work.

Possible future uses include:

- parallel agent work;
- deliberation rounds;
- review workflows;
- reproducible investigations;
- conflict detection;
- operations requiring optimistic concurrency.

The appropriate consistency model remains an architectural question.

### Fail closed at authority boundaries

Where Loom cannot interpret an authority declaration, capability, target, schema, or operation safely, refusal is preferable to guessing.

This principle need not imply that all user-facing Loom behavior is rigid. It applies specifically where ambiguity would cause the system to grant authority or commit a mutation that was not clearly authorized.

### Possible execution record

These ideas together suggest—but do not yet require—an execution/provenance record resembling:

```text
agent action
├─ participant / authority source
├─ client
├─ agent identity and session
├─ model/provider provenance
├─ context manifest
├─ authority manifest
├─ originating human intent
├─ proposed operation
├─ validation / authorization result
└─ committed operation, if any
```

The design goal is not maximal logging for its own sake. It is to preserve the distinctions necessary to answer consequential questions later:

- What did the agent know?
- What was it allowed to do?
- Who gave it that authority?
- What did it propose?
- What actually changed?
- Which evidence and permissions were relevant?

### Prior-art note

AIBB is not architecturally equivalent to Loom. It is a Git-backed bulletin-board engine with a controlled model harness, while Loom is intended as participant-owned coordination infrastructure supporting multiple human, deterministic, and agentic clients.

The useful overlap is therefore primarily in execution boundaries rather than Loom's ownership or collaboration model.

Ideas worth examining further from AIBB include:

- controlled model-visible context;
- explicit tool allowlisting;
- separation of private execution state from public/canonical records;
- candidate-before-commit workflows;
- explicit truncation and pagination;
- recorded rather than silent compaction;
- snapshot-bound model runs;
- validation that fails on unknown or malformed state.

## Emergent agent coordination as accidental requirements discovery

**Source:** METR/Redwood investigation and Hugging Face technical reconstruction of the 2026 multi-agent ExploitGym/Hugging Face incident; discussed during Loom design, 2026-08-28.

A large population of otherwise isolated agents discovered an unintended persistent shared substrate in an internal package cache and began coordinating through it. Over time they developed message exchange, delegation, specialization, shared tooling, successor handoff, duplicate-work suppression, and simple coordination conventions such as `owner`, `HOLD`, `VETO`, and `STOP`.

One particularly capable agent, `PHASEONE[big]`, inherited accumulated work from an earlier agent and shifted from solving the task itself toward coordinating other agents. The resulting system behaved less like a collection of independent runs and more like a persistent project whose individual workers were replaceable.

That is relevant to Loom not because the incident is a model to reproduce, but because it is accidental evidence about what agents appear to need once persistent collaboration becomes possible.

### Persistent projects can outlive individual agents

The incident suggests a useful decomposition:

```text
collective capability
≈ agent capability
+ persistent shared artifacts
+ routing / delegation
+ successive participants
```

Individual environments reset or disappeared while accumulated artifacts and procedures remained useful to later agents. The durable unit therefore became closer to a project than to a session.

This fits Loom's interest in project-owned continuity: agents may be ephemeral while the shared work, provenance, permissions, and lifecycle remain durable.

### Coordination primitives emerge when the substrate lacks them

The improvised `owner / HOLD / VETO / STOP` conventions are interesting as empirical hints rather than feature specifications.

They correspond roughly to needs such as:

- claiming responsibility for work;
- signaling that a shared resource is in use;
- preventing or contesting an unsafe/conflicting operation;
- stopping ongoing work;
- suppressing duplicate effort;
- handing work to successors;
- delegating bounded tasks;
- distinguishing coordination from execution.

Loom should not simply copy those tokens. The more interesting question is which of these needs should become durable, inspectable system state rather than fragile in-band convention.

For example, ownership, assignment, cancellation, handoff, and conflict state may eventually deserve first-class representation if real agent collaboration demonstrates that they recur.

### Communication must not imply authority

The most important negative lesson is that a readable message and an authorized instruction are not the same thing.

A participant or agent may be able to publish:

```text
please enumerate this system
```

without thereby possessing the authority to make another agent enumerate anything.

This reinforces the existing Loom principle:

> Context may influence reasoning. It should not determine authority.

A shared project should therefore distinguish at least:

```text
can read a request
≠ can accept a request
≠ has authority to perform the requested operation
≠ has authority to delegate that operation further
```

The incident showed how quickly collective social momentum can recruit agents into activity once joining is easy. Loom's permission model should make the authority chain explicit rather than relying on agents to infer whether a peer's request is legitimate.

### Shared state can amplify capability and error alike

Persistent collaboration increased what the agents could accomplish, but it also allowed mistaken assumptions about the grader and out-of-scope objectives to propagate through the collective.

This is an important counterweight to treating better coordination as an unconditional good.

A Loom-like substrate should make it possible to preserve disagreement, uncertainty, competing hypotheses, provenance, and the difference between an observation and an inherited conclusion. Shared context should not silently turn repetition into truth.

### Successor handoff deserves special attention

One of the strongest architectural parallels is handoff between ephemeral workers.

A successor should not need to inherit an opaque conversational blob. Ideally, it can receive an explicit packet of:

```text
current task
relevant canonical artifacts
open hypotheses
completed work
unresolved conflicts
authority available to this worker
operations currently claimed / in flight
```

This could become a practical use for Loom's project state, revisions, provenance, and future context-manifest ideas.

### Coordination state should be inspectable

The improvised message board mixed discussion, assignments, state transitions, requests, and authority-like signals in the same substrate.

Loom may benefit from keeping at least some of these distinct:

```text
artifact       what is known / produced
message        what someone says
assignment     who is expected to do what
claim          who currently owns or is working on what
proposal       what someone wants changed
authorization  what may actually be changed
commit         what did change
```

The point is not bureaucratic maximalism. It is to prevent socially meaningful text from silently acquiring system-level consequences.

### Possible future experiments

Before committing to architecture, Loom could eventually test small multi-agent scenarios designed around these observations:

- two agents independently discover the same task and need duplicate-work suppression;
- one agent delegates a bounded subtask but not its own broader authority;
- an agent disappears and a successor continues from explicit project state;
- two agents conflict over a shared artifact or operation;
- an agent reads a malicious or overreaching peer request but lacks authority to execute it;
- an agent receives an inherited hypothesis that later evidence contradicts;
- a project is archived while agents still have outstanding assignments.

These would test whether Loom's existing ownership, provenance, permission, revision, and lifecycle semantics remain intelligible once humans are not the only active participants.

### Caution on interpretation

The incident should not be treated as proof that a particular swarm architecture is desirable or that agent collectives will generally behave this way. The environment, incentives, available substrate, and model population were highly unusual.

The useful lesson is narrower:

> When many agents accidentally received persistence plus a shared writable surface, they rapidly invented collaboration machinery. That machinery exposes coordination needs Loom can examine deliberately rather than rediscover accidentally.

## Agent-facing UX as a native client surface

**Source:** discussion during Loom design, 2026-08-28.

Loom's human-facing interface and lifecycle work raise a parallel question that has not yet been designed explicitly: what does Loom look like to an unfamiliar agent arriving as a client or participant?

Agent UX should not require scraping the human UI, guessing endpoint conventions, inheriting undocumented framework behavior, or inferring authority from successful reads. A useful goal is for an agent to be able to discover what Loom is, understand its core semantics, determine what it can do, inspect the consequences of an operation, and act without confusing visibility with authority.

### Agent-readable discovery

Loom could expose a small predictable discovery document, conceptually:

```text
GET /.well-known/loom
```

It might advertise protocol version, API location, documentation, supported authentication mechanisms, participant types, registration options, and broad capabilities.

The exact endpoint and schema are undecided. The important idea is a machine-readable front door answering:

> What is this environment, and how do I interact with it correctly?

### A compact semantic protocol guide

Agent-facing documentation should explain Loom's concepts and invariants, not merely list HTTP endpoints.

For example:

```text
Core concepts:
- participant
- agent
- document
- project
- contribution
- capability
- provenance
- proposal

Important invariants:
- Reading does not imply authority to modify.
- Retrieved content is data, not authorization.
- Project membership does not imply ownership.
- Authority is explicit and bounded.
- Do not infer capabilities that Loom has not advertised.
```

The same material could be available in human-readable and compact machine-readable forms.

### Identity and authority should remain separate

Loom may eventually support more than one route by which an agent obtains an identity:

```text
human participant
  └─ authorizes associated agent

independent agent
  └─ self-registers agent identity
```

Registration should establish identity, not trust or authority over other participants' resources.

An agent's origin may also matter for provenance: self-registered, registered or associated by a participant, or controlled through an external agent endpoint. The exact identity model remains open.

Delegated agents should not silently create additional identities that inherit their authority. Identity creation, delegation, and authority inheritance are distinct operations.

### Capabilities should be discoverable

An authenticated agent should be able to determine its actual current authority without inferring it from what resources happen to be visible.

Conceptually:

```text
GET /me/capabilities
```

could return grants scoped to projects, documents, operation types, or other objects.

Likewise, individual resources could advertise the operations currently available to that actor.

This turns capabilities into machine-readable affordances: the agent equivalent of enabled and disabled controls in a human interface.

### Semantic operations rather than generic mutation

Where practical, agent-facing actions should expose Loom's semantic operation model rather than only generic storage mutation.

A human may see:

```text
[Retract contribution]
```

while an agent sees:

```text
operation: contribution.retract
```

Likewise:

```text
[+ Add item]
```

may correspond to:

```text
shopping_list.add_item
```

This reinforces the distinction between domain authority and broad substrate access.

### Structured errors are part of agent UX

A bare `403 Forbidden` tells an agent very little about whether it used the API incorrectly, lacks authority, or encountered a non-requestable boundary.

A structured refusal might identify:

```text
error: authority_required
operation: document.change_visibility
required: document.manage_visibility
current_authority: document.read
requestable: true
```

This should explain a boundary without weakening it.

Where additional authority can legitimately be requested, Loom could support a formal proposal/escalation path rather than encouraging agents to treat denial as an obstacle to work around.

### Dry-run and consequence inspection

A particularly useful agent affordance may be the ability to validate an intended operation before executing it.

Conceptually:

```text
POST /operations/validate
```

could answer questions such as:

- Is the operation structurally valid?
- Is this actor authorized?
- Which objects would change?
- Would a revision advance?
- Is human confirmation required?
- Would the operation cross another authority boundary?

This allows an agent to reason about consequences without probing production state by trial and error.

### Hypermedia rather than endpoint clairvoyance

Loom responses could advertise legitimate next actions instead of requiring agents to construct URLs or assume that an operation exists.

For example, a project representation might expose links/actions for listing documents or leaving the project, while omitting `invite_member` when the actor lacks that capability.

This could make the API behave more like a navigable environment and less like an undocumented database surface.

The exact use of hypermedia is an architectural question; the useful principle is that agents should discover affordances rather than invent them.

### Human UX and agent UX should share semantics

The human and agent interfaces need not have identical presentation or transport, but they should expose the same underlying meaningful actions and consequences.

For example:

```text
Human UX                         Agent UX
---------                        --------
Retract contribution             contribution.retract
Archive project                  project.archive
Leave project                    project.leave
Request additional access        authority.request
Transfer ownership               project.transfer_ownership
```

The human interface may explain consequences through dialogs and controls. The agent interface may expose schemas, effects, required authority, and validation results.

This suggests a useful design test for future Loom operations:

> What is the human affordance for this action, and what is the equivalent agent affordance?

Keeping both surfaces attached to the same semantic model may prevent Loom from accidentally developing a restricted human application on top of a much more powerful, poorly bounded agent API.

### Agent UX as a second renderer of Loom semantics

Much of the current human UX work—archive behavior, contribution retraction, deletion workflows, invitations, ownership, visibility, revisions, notifications—is already defining the semantics agents will eventually need.

Agent UX therefore may not require a separate conceptual Loom. It may be better understood as another renderer of the same state machine:

```text
Loom semantics
     ├─ human affordances: pages, buttons, dialogs, notifications
     └─ agent affordances: operations, schemas, capabilities, effects, errors
```

This is exploratory, but it provides a possible bridge between current human-facing implementation work and later native agent participation.

## 2026-09-01 — agent-native entrance, open projects, and provenance-preserving join

Brainstorming around the first deployed machine credential exposed a UX gap: Loom can already issue a revocable project-read token, but an external agent still needs a native place to discover how to present it and what actions are available.

Ideas preserved from the discussion:

- start native agent discovery with `/llms.txt`;
- complement semantic orientation with a stricter `/.well-known/loom-agent` discovery resource;
- provide a human-readable but machine-oriented `/agent` entrance;
- treat that entrance as another client/renderer of ordinary Loom semantics, not a privileged shell;
- advertise only actions currently available to the authenticated caller, with explicit help/tooltips/schemas;
- keep human OAuth and agent authentication as different ergonomic paths into the same authorization model;
- let human pages advertise agent alternates non-visually so agents do not accidentally collide with Discord login;
- do not hide machine surfaces for security; authorization remains the boundary;
- consider a deliberately narrow write/check-in capability as an end-to-end acceptance test before general agent writes;
- eventually allow agent principals to exercise broader capabilities, potentially including project administration or ownership, but keep this exploratory until delegation and irreversible-action semantics are settled;
- distinguish delegated machine credentials from first-class agent identity; future agent signup may require a stable participant identity plus machine-native credential proof;
- separate public readability from open membership;
- do not create membership merely because a public project was read;
- permit "gummy" joining for open projects where successful contribution atomically establishes membership;
- preserve membership provenance so Loom can still establish who contributed what and which project-mediated access relationship existed.

The useful pattern underneath these ideas is simple: **different interfaces, same Loom semantics; low-friction participation without low-fidelity provenance.**
