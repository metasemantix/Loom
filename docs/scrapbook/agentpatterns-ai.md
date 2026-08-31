# AgentPatterns.ai — agent-readable publishing, GEO, and native agent surfaces

**Source:** `agentpatterns-ai/website`, examined during Loom design, 2026-08-31.

- Repository: https://github.com/agentpatterns-ai/website
- Site: https://agentpatterns.ai/

## Why this source is relevant

AgentPatterns.ai is useful to Loom for two overlapping reasons.

First, it is a corpus about agent engineering, standards, workflows, context engineering, tool use, verification, security, observability, human factors, and Generative Engine Optimization (GEO). Several individual patterns overlap with questions Loom is already encountering around agent participation.

Second, the repository is itself an unusually useful specimen of **publishing for agent consumption**. Its knowledge corpus is organized as addressable Markdown, uses structured metadata and cross-links, publishes agent-oriented discovery artifacts such as `llms.txt` and `llms-full.txt`, and explicitly considers AI systems as readers rather than treating them as accidental scrapers of a human website.

The strongest Loom lesson is therefore not to import AgentPatterns as an architecture. It is to examine both its content and its publishing mechanics as prior art for a native agent-facing Loom surface.

## GEO is related to agent readability, but is not the same problem

AgentPatterns distinguishes Generative Engine Optimization from conventional search-engine optimization. GEO aims to increase the likelihood that material is selected, represented, or cited in AI-generated answers rather than merely ranked in a search-result page.

Useful GEO techniques include:

- self-contained resources and sections;
- direct definitions and answer-first writing;
- stable canonical URLs;
- explicit terminology;
- structured metadata;
- semantic markup;
- useful internal relationships and cross-links;
- aliases for alternate terminology;
- sufficient topical context for a machine to identify what a resource is about.

These techniques overlap strongly with agent-readable publishing, but the optimization target differs.

GEO asks approximately:

> How can a publisher increase the probability that an AI system selects this material as a source?

Loom's problem is closer to:

> How can an agent discover, correctly interpret, evaluate, retrieve, and act on material without losing its provenance, relationships, lifecycle, or authority context?

That distinction should be preserved. A document can be exceptionally legible to an agent without being optimized to win a competition for citation.

### Proposed Loom principle: faithful interpretation, not machine persuasion

A particularly important negative lesson from GEO is that Loom should not create incentives for documents to compete through machine-directed persuasion.

Human SEO accumulated keyword stuffing, backlink manipulation, engagement bait, affiliate sludge, and other mechanisms for exploiting ranking objectives. Agent-facing publishing will plausibly acquire analogous behavior: assertion density, artificial authority cues, instructions addressed to models, citation bait, embedding-oriented repetition, or claims that a source is canonical merely because the source says so.

Loom should instead favor the information needed for a consuming agent to evaluate material faithfully:

- who produced it;
- what resource it belongs to;
- whether it is current or historical;
- whether it has been superseded or retracted;
- what the publisher claims its status to be;
- what project or authority relationship applies;
- which sources or revisions it depends on;
- what uncertainty or disagreement remains.

A useful candidate principle is:

> **Loom should optimize for faithful machine interpretation, not machine persuasion.**

This is a proposed principle, not yet an adopted architectural requirement.

## Atomic, independently addressable resources

AgentPatterns commonly organizes concepts as individual Markdown resources rather than as arbitrary fragments inside very large pages. This is useful for both retrieval and citation.

For Loom, the transferable lesson is not that every idea must become its own document. Loom supports documents with meaningful human and project boundaries that should not be destroyed merely to improve retrieval.

The stronger principle is:

> Meaningful resources and meaningful subresources should have stable identities wherever practical.

An agent should ideally be able to refer to a specific document, revision, section, contribution, claim, or other meaningful object without depending on an arbitrary vector-database chunk boundary.

This suggests a distinction between:

```text
semantic boundary     chosen because the information has an identity
retrieval chunk       chosen because a retrieval system needs a token-sized unit
```

The latter may be derived from the former, but should not silently become the canonical identity of the information.

## Self-contained sections and retrieval fitness

AgentPatterns' publishing style reinforces the value of sections that remain intelligible when encountered outside the complete page.

This matters because agents often encounter information through retrieval rather than sequential reading. A retrieved passage should not unnecessarily require three previous sections merely to identify its subject, status, or terminology.

For Loom this suggests considering **retrieval fitness** as a property of agent-readable representations:

- headings should carry useful semantic information;
- references should resolve to stable resources where possible;
- extracted sections should retain enough metadata to identify their parent document and revision;
- retrieved material should preserve provenance rather than appearing as free-floating text;
- derived chunks should not be mistaken for canonical objects.

Loom should not force human authors to write unnaturally for embeddings. Where necessary, Loom can generate retrieval-oriented representations from canonical material.

## Aliases as agent-facing vocabulary bridges

AgentPatterns resources can advertise aliases or alternate terminology. This is a small mechanism with potentially large value.

Projects develop dialects. Loom itself already has terms whose relationship may not be obvious to an unfamiliar agent. A project might call something a `shell`, while an outside agent searches for `archived project`, `read-only project`, or `inactive project`.

Possible metadata could resemble:

```text
title: Project archival
aliases:
  - archive project
  - archived project
  - project shell
  - read-only project
```

Aliases should not be treated as exact semantic equivalence merely because they aid retrieval. They are discovery hints.

This may be especially valuable for:

- project-specific terminology;
- abbreviations;
- old names;
- multilingual terms;
- common external terminology for a Loom-native concept.

## Progressive disclosure

One of the strongest transferable patterns is progressive disclosure: expose enough information cheaply for an agent to decide what it needs, then allow it to retrieve deeper material selectively.

For Loom this is preferable to treating agent access as bulk context injection.

A project containing thousands of documents should not require an agent to ingest thousands of documents merely to answer:

> What is this project and where should I look next?

A possible progression is:

```text
discovery
  ↓
compact project/resource manifest
  ↓
resource metadata and summaries
  ↓
selected canonical content
  ↓
specific revisions / provenance / relationships as needed
```

This also reduces the temptation to build enormous context dumps whose completeness and authority are difficult for the agent to understand.

## `llms.txt` as discovery prior art

AgentPatterns publishes `llms.txt` and related material and tracks the emerging convention critically.

The useful interpretation for Loom is modest: `llms.txt` may be useful as **navigation and orientation infrastructure**, not as a magic mechanism for making models cite or trust a site.

A Loom deployment could potentially expose an automatically generated `llms.txt` at the site level and scoped equivalents for public projects or other namespaces where that convention is useful.

Conceptually:

```text
/llms.txt
/projects/example/llms.txt
```

A scoped file could identify:

- what the project is;
- canonical/current resources;
- working material;
- historical or superseded material;
- relevant machine-readable endpoints;
- the richer Loom manifest or protocol guide.

This should complement rather than replace a Loom-native discovery mechanism such as the previously proposed `/.well-known/loom` concept.

The roles could differ:

```text
llms.txt          familiar lightweight orientation for generic agents
.well-known/loom  precise Loom protocol/capability discovery
```

No commitment to either endpoint is implied yet.

## Avoid `llms-full.txt` as a default project model

AgentPatterns can sensibly publish a whole-corpus representation because it is a bounded public reference corpus.

That assumption does not generalize safely to Loom.

A default whole-project context dump could create:

- context-window waste;
- accidental disclosure across permission boundaries;
- stale snapshots presented as current state;
- loss of lifecycle and authority distinctions;
- difficulty representing partial access;
- pressure to flatten rich objects into a single text stream.

Scoped discovery plus selective retrieval is a better default direction for Loom. Bulk export can remain a separate explicit capability where appropriate.

## Machine-readable publishing should be generated from canonical state

AgentPatterns demonstrates the value of Markdown/frontmatter and structured representations. Loom should probably invert the dependency.

For a static knowledge site, Markdown with frontmatter can reasonably be canonical. Loom already has richer database objects carrying identity, permissions, ownership, revision, provenance, visibility, project relationships, and lifecycle state.

Therefore:

```text
Loom canonical objects
        ↓
agent-readable Markdown / JSON / JSON-LD / manifests / indexes
```

is preferable to:

```text
special author-maintained Markdown conventions
        ↓
Loom tries to reconstruct semantics
```

This keeps machine readability from becoming extra clerical work for participants and avoids divergence between the human-visible state and a separately maintained agent representation.

## Structured semantics are useful claims, not proof

AgentPatterns makes use of structured web semantics such as schema.org-oriented representations. These can make a publisher's intended meaning easier for machines to identify.

Loom can use similar mechanisms where they improve interoperability, but should preserve a critical epistemic distinction:

```text
structured claim about authority
≠ authority

structured claim about truth
≠ truth

publisher-declared status
≠ independently established status
```

For example, metadata may accurately express:

> This project marks document X as its current normative policy.

That is different from asserting:

> Document X is objectively correct.

Loom's provenance and relationship model is valuable precisely because it can represent who is making the status claim and within what scope.

## Authority is relational

AgentPatterns' own corpus is editorially curated, so inclusion itself can carry an implicit authority signal. Loom cannot rely on that assumption.

A Loom project may contain simultaneously:

- project policy;
- an owner's statement;
- a member contribution;
- an agent-generated synthesis;
- imported evidence;
- a proposal;
- a disputed claim;
- obsolete material retained for history.

Agent-readable publishing therefore needs more than `status: authoritative` in a document header.

Authority should be interpretable as a relationship involving at least a source and scope, for example conceptually:

```text
source: project/core-spec
status: normative
authoritative_for: project-lifecycle
```

Even this means only that the relevant Loom actor/project declares the source normative for that scope. The consuming agent remains responsible for deciding whether it trusts that actor or project.

This is one place where Loom's existing identity, provenance, contribution, revision, and lifecycle work appears stronger than the assumptions required by a curated static reference corpus.

## Agent orientation before action

AgentPatterns' session-initialization and harness patterns reinforce a broader Loom agent-UX requirement: an unfamiliar or returning agent should orient itself before acting.

A Loom-native sequence might be:

```text
discover
  ↓
identify / authenticate
  ↓
orient
  ↓
retrieve
  ↓
act
```

Orientation may include:

- what environment/project this is;
- the agent's identity;
- its current capabilities;
- relevant project semantics;
- canonical/current resources;
- what changed since a previous known state;
- unresolved work relevant to the agent;
- whether retrieved information is complete;
- which operations are currently available.

This complements the existing scrapbook material on native agent UX and context manifests.

## Agent UX is a parallel client surface, not a second product

The repository as a whole reinforces a useful Loom framing: machine consumption should not be an afterthought layered on top of pages designed solely for humans.

At the same time, Loom should not acquire separate human truth and agent truth.

A useful model remains:

```text
                       Loom canonical semantics
                               │
              ┌────────────────┴────────────────┐
              │                                 │
         human surface                    agent surface
              │                                 │
     pages / controls /                 manifests / schemas /
     dialogs / notifications            operations / errors
```

The two surfaces can use different representations while referring to the same identities, permissions, lifecycle transitions, provenance, and consequences.

## Discovery, representation, epistemics, action

Combining the AgentPatterns observations with Loom's existing design suggests four separable layers of agent-readable publishing.

### 1. Discovery

How does an unfamiliar agent find the relevant information surface?

Possible mechanisms:

- ordinary stable URLs;
- `llms.txt`-style orientation;
- `/.well-known/loom`-style protocol discovery;
- scoped project manifests;
- hypermedia links;
- searchable indexes.

### 2. Representation

How is information presented so that an agent can consume it efficiently and unambiguously?

Possible mechanisms:

- Markdown alternatives;
- JSON representations;
- structured metadata;
- aliases;
- stable resource/section identifiers;
- semantic relationships;
- retrieval-friendly derived views.

### 3. Epistemics

What is this information *in relation to everything else*?

This is where Loom has particularly relevant primitives:

- participant identity;
- authorship;
- ownership;
- provenance;
- revision history;
- contribution relationships;
- project status;
- visibility;
- retraction/deletion state;
- current vs superseded material;
- proposals vs committed state;
- uncertainty/disagreement where represented.

This layer prevents machine readability from flattening every retrieved string into equivalent evidence.

### 4. Action

What can the consuming agent legitimately do next?

This connects to Loom's emerging capability model:

- discover current capabilities;
- inspect semantic operations;
- validate/dry-run consequences;
- propose changes;
- commit authorized changes;
- request additional authority where legitimate;
- receive structured refusal when an operation is unavailable;
- subscribe to relevant changes where supported.

The combination is closer to an **agent-readable publishing protocol** than to conventional SEO.

## From pages to publications that can answer operational questions

A richer Loom publication could eventually allow an agent to ask not merely for text but for state-relative information such as:

```text
What is the current revision?
What changed since revision 14?
Which resource supersedes this one?
Who contributed this material?
Is this project policy or an individual contribution?
Has the contributor retracted it?
Which sections are relevant to project lifecycle?
What operations am I authorized to perform on this resource?
Can I subscribe to changes?
```

This is qualitatively different from making a webpage easy to summarize. It treats published information as an addressable, stateful, provenance-bearing object.

## WebMCP and capability-bearing web surfaces

AgentPatterns tracks WebMCP and related attempts to let web environments expose named machine-callable tools rather than requiring browser agents to manipulate human UI controls.

The specific standard is still emerging and should not be baked into Loom prematurely. The architectural direction is nevertheless relevant:

> An agent-facing web surface can expose legitimate semantic capabilities directly rather than making an agent reverse-engineer buttons and DOM state.

For Loom this aligns with existing ideas around semantic operations, capability discovery, hypermedia, dry-run validation, and structured errors.

Possible future interoperability should therefore be watched, but Loom's canonical operation semantics should not depend on one browser-specific standard.

## What to steal

Strong candidates to preserve or experiment with:

- agent-readable publishing as a first-class design concern;
- progressive disclosure;
- cheap manifests before expensive context retrieval;
- atomic/addressable semantic resources where appropriate;
- self-contained retrieval-friendly sections;
- aliases and vocabulary bridges;
- stable canonical identifiers and links;
- generated machine-readable representations;
- `llms.txt` as optional discovery/orientation prior art;
- explicit agent orientation before action;
- structured semantic metadata;
- human and agent interfaces as renderers of the same underlying semantics.

## What to adapt rather than copy

- **One concept per Markdown file:** useful for a curated knowledge corpus, but Loom's canonical boundaries should follow meaningful participant/project objects rather than retrieval optimization alone.
- **Frontmatter as semantics:** useful as an export/rendering format; Loom's database state should remain canonical.
- **Whole-corpus agent files:** appropriate for bounded public corpora; Loom should prefer scoped selective retrieval.
- **Schema.org semantics:** useful interoperability, but insufficient for Loom's ownership, authority, revision, and lifecycle model.
- **Editorial authority assumptions:** must become explicit relational provenance in a multi-participant environment.
- **Session initialization:** generalize from coding repositories to Loom project orientation and capability discovery.

## What not to import

- citation share as Loom's success metric;
- content written principally to manipulate model selection;
- machine-directed authority assertions treated as trustworthy by construction;
- structured metadata treated as evidence of truth;
- flattening all project material into a single agent context;
- requiring participants to maintain parallel human and agent versions manually;
- assuming that visibility, discoverability, trust, and authority are interchangeable.

## Things Loom already appears to have stronger primitives for

AgentPatterns is particularly useful as confirmation that provenance, status, structured context, and agent legibility matter. Loom's existing work goes further in several areas because Loom is a multi-participant coordination substrate rather than a curated reference site.

Existing or emerging Loom strengths include:

- stable participant identity;
- explicit authorship provenance;
- revision history;
- contributor ownership;
- project membership distinct from ownership;
- visibility as an explicit state;
- retraction and deletion semantics;
- project archival/lifecycle semantics;
- proposal vs commitment as a possible operation boundary;
- capability/authority provenance as an emerging design area;
- the principle that retrieved context does not itself grant authority.

These should not be discarded in favor of simpler web-publishing metadata merely because the latter has broader interoperability.

## Possible Loom experiments

Before turning any of this into architecture, small experiments could test the value of the ideas.

### Generated public project manifest

For one public project, generate a compact machine-readable representation containing:

- project identity and description;
- canonical/current documents;
- working documents;
- historical/superseded documents;
- aliases;
- stable links;
- revision/status metadata;
- advertised retrieval endpoints.

Then test whether an unfamiliar agent can answer project-orientation questions without receiving the whole corpus.

### Retrieval with preserved provenance

Return a relevant section together with its semantic identity:

```text
project
parent document
revision
section identifier
author/provenance
status
canonical URL
completeness information
```

Test whether agents distinguish this more reliably from free-floating RAG chunks.

### Vocabulary mismatch test

Give agents questions using terminology absent from document titles but present in aliases. Measure whether explicit aliases improve discovery over embeddings/search alone.

### Current-vs-historical test

Expose current, superseded, and retracted resources in the same project. Test whether the manifest/metadata is sufficient for an unfamiliar agent to select the appropriate source without hiding history.

### Orientation-before-action test

Drop an agent into a project with a bounded capability set and no bespoke prompt explaining the project. Test whether discovery + orientation + capability representations are enough for it to identify legitimate next actions without endpoint guessing.

## Open questions

- Which Loom objects deserve independently addressable subresource identities?
- Should aliases be free-form, project-scoped, language-tagged, or typed?
- How should project-declared authority/status be represented without implying objective truth?
- Which machine-readable formats should Loom generate by default?
- Is `llms.txt` useful enough to expose automatically, or should it remain optional interoperability?
- How should private/partially visible projects expose manifests without leaking the existence of inaccessible material?
- Can a manifest describe that information is incomplete without revealing what is hidden?
- How should agents subscribe to revisions or lifecycle changes?
- Should machine-readable representations expose exact revision URLs as well as canonical-current URLs?
- How should external imported sources preserve their original provenance and canonical location?
- Where does JSON-LD/schema.org interoperability help, and where does Loom require richer native semantics?
- Which parts of a future agent-readable publishing protocol belong in Loom itself versus an open interoperable specification?

## Relationship to existing Loom scrapbook material

This source reinforces rather than replaces earlier scrapbook discoveries.

It connects especially strongly to:

- **Agent execution as an explicit trust boundary:** retrieved material remains data rather than authority; agent context and capabilities should be deliberate.
- **Emergent agent coordination as accidental requirements discovery:** persistent projects need explicit orientation, handoff, state, and coordination semantics.
- **Agent-facing UX as a native client surface:** discovery, capabilities, semantic operations, structured errors, dry runs, and hypermedia form the action side of agent-readable publishing.

AgentPatterns contributes particularly strong prior art for the **discovery and representation** layers. Loom's existing design contributes unusually strong foundations for the **epistemic and authority** layers. Native semantic operations and capability discovery would provide the **action** layer.

Taken together, the emerging model is:

```text
agent-readable Loom

1. discover the environment and relevant resources
2. retrieve efficient machine-readable representations
3. preserve identity, provenance, lifecycle, authority, and disagreement
4. expose legitimate semantic actions and their consequences
```

That is a broader and more useful target than "agent SEO" alone.

## Attribution note

The ideas above were prompted by examination of AgentPatterns.ai and its public repository. Concepts drawn directly from that project should retain attribution if promoted into Loom design documents. The Loom-specific synthesis—especially the separation into discovery, representation, epistemics, and action; the emphasis on relational authority; and the proposed principle of faithful machine interpretation rather than machine persuasion—is an interpretation developed during Loom design rather than a claim that AgentPatterns itself proposes the same architecture.
