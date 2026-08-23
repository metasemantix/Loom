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
