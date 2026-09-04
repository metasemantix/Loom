# Loom AI Knowledge Network: persistent derived understanding

Source: `q8886b/loom-ai-knowledge-network` — https://github.com/q8886b/loom-ai-knowledge-network

Status: exploratory external-architecture note. This is a separate project that happens to share the Loom name. Attribution should be preserved for borrowed concepts.

## Why this is foundational for Loom

This project asks a question our current document lifecycle does not yet answer strongly enough: **what persists after an agent has read a document?**

Our current direction distinguishes technical metadata, a classified semantic compression for retrieval/triage, and classified full document content. That solves much of the *before reading* problem: an agent can decide whether expensive/sensitive full content is relevant. This external Loom focuses much more heavily on the *after reading* problem: preserving derived understanding and synthesis with traceability back to source material.

That makes it relevant to Loom's own information architecture, not merely an application that could eventually be built on top of Loom.

## Observed in the external project

The project describes a layered cognitive pipeline roughly of the form:

```text
preserved source
-> understanding of individual sources
-> cross-source synthesis/judgment
-> reusable cross-domain thinking patterns
```

It uses structured/typed cognitive artifacts rather than treating every derived artifact as generic notes. Examples include concepts, structures, mechanisms, cases, judgments, reflections, patterns, and topics.

Explicit reviewed relationships are treated as more authoritative than automatically inferred similarity; embeddings can help suggest relationships without silently making those relationships canonical.

Agent-generated insights can return through controlled/reviewable proposal paths rather than automatically becoming accepted knowledge.

The implementation is local-first and uses a substantially different product model from Loom, but the source-to-understanding lifecycle is the important architectural observation here.

## Convergence with Loom

There is strong independent convergence around:

- preserved source material plus derived agent-usable representation;
- traceability/provenance from derived knowledge back to sources;
- controlled return paths for agent-generated material;
- treating persistent knowledge as more than raw retrieval chunks;
- separating automatically suggested relationships from reviewed/canonical relationships.

## The important distinction: compression versus digestion

Loom's semantic compression is currently best understood as **pre-reading routing information**:

```text
metadata -> compression -> decide whether full document is relevant -> full document
```

The external project's higher layers are closer to **post-reading cognitive material**:

```text
full document read
-> extracted/derived concepts, mechanisms, claims, cases, etc.
-> cross-document synthesis
-> reusable patterns or judgments
```

These are complementary rather than competing representations.

A future Loom lifecycle might therefore distinguish at least:

```text
source/full document
pre-reading compression
post-reading derived understanding
cross-document synthesis
```

Each layer should retain provenance and version relationships so that derived understanding can be reconsidered when its sources change.

## Concept worth adapting: typed derived knowledge

Rather than persisting a generic "agent note," consider typed derived objects such as:

- claim
- concept
- mechanism
- case/example
- relationship
- synthesis
- judgment/inference
- unresolved question
- reusable pattern

The exact taxonomy should not be copied prematurely. The foundational point is that derived understanding may deserve first-class identity, provenance, lifecycle, and review semantics rather than being stuffed into document text or transient agent memory.

## Concept worth adapting: suggested versus canonical relations

Machine similarity, embeddings, or agent inference can propose links between information objects. A proposed relation should remain distinguishable from an explicit/reviewed relation.

This fits Loom's broader insistence on provenance and avoiding silent collapse between observation, inference, proposal, and adopted state.

## Concept worth adapting: source-aware invalidation/review

If derived understanding persists, Loom eventually needs to know what happens when the underlying document changes, is retracted, loses visibility, or is superseded. Derived artifacts should retain enough source/version provenance to be flagged for reconsideration rather than floating free as apparently timeless truth.

This requirement is an inference for Loom, not necessarily an implementation claim about the external project.

## Important mismatch

The external Loom is primarily a local cognitive/knowledge substrate: sources are digested into increasingly abstract reusable understanding.

Our Loom's foundational problem is broader and more social/governance-heavy: participants and agents exchange durable information under authority, provenance, revision, visibility, disclosure, contribution, and retraction rules.

Therefore its cognitive pipeline is useful as evidence for a missing **derived-understanding layer inside Loom**, while its local-first implementation and overall product boundary should not be adopted wholesale.

## Open architectural question

**What should persist after an authorized agent reads a Loom document?**

Possible answers range from "nothing unless explicitly written" through attributable private notes to project-shared typed derived knowledge. The answer interacts directly with classification, disclosure, source retraction, provenance, agent authority, and review.

This deserves explicit design before agent reading becomes commonplace, because otherwise persistent agent understanding will emerge accidentally in whatever memory/scratchpad layer happens to be available.
