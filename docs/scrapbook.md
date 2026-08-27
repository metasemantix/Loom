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
