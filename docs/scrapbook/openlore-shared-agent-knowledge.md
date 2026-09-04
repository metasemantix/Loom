# OpenLore: shared agent knowledge substrate

Source: `aakarim/OpenLore` — https://github.com/aakarim/OpenLore

Status: exploratory external-architecture note. Attribution should be preserved for borrowed concepts.

## Why this is foundational for Loom

OpenLore addresses a problem immediately adjacent to Loom's first-class agent access: agents and humans need a persistent shared corpus rather than a collection of isolated chat contexts. Its design is therefore useful not merely as something that could run on Loom later, but as evidence about Loom's own agent-facing substrate.

## Observed in OpenLore

OpenLore exposes shared knowledge through an agent-native virtual filesystem, reachable through interfaces including SSH and MCP. Agents can navigate with familiar filesystem/search operations rather than requiring a bespoke retrieval vocabulary. The virtual shell is constrained rather than an ambient operating-system shell.

Authorization is scoped around identities, document sets, and capabilities. OpenLore distinguishes read-only, publish, and read-write authority rather than collapsing contribution and mutation into one `write` permission.

Delegated identity preserves both principal and acting agent, allowing actions performed on behalf of a human to remain distinguishable from direct human actions while preventing delegation from expanding authority.

Writes converge on a governed path with authorization, validation/conflict handling, and policy. Some sensitive writes can become reviewable change requests instead of immediate mutation.

## Convergence with Loom

This independently supports several directions already emerging in Loom:

- persistent shared knowledge is a better primitive for multi-agent work than putting an AI participant in a group chat;
- agent access should be scoped and revocable;
- provenance should preserve both principal and actual actor;
- contribution/publishing should be separable from authority to mutate canonical material;
- UI, API, MCP, imports, and future agent interfaces should ultimately share one authorization/provenance/write seam.

## Concepts worth adapting

### Agent-native project projection

Consider exposing a Loom project as a filesystem-like projection for agents while keeping Loom's database and document model canonical. For example:

```text
/projects/<project>/
  manifest.json
  documents/
    <document>/
      metadata.json
      compression.md
      content.*
  contributions/
  requests/
```

This could make ordinary agent tools such as list/find/search/read sufficient for corpus navigation without reducing Loom itself to files and folders.

### Delegated actor provenance

Model actions with at least two potentially distinct identities:

```text
principal = human/project participant granting authority
actor     = agent actually performing the action
```

A human-authorized agent action should not be flattened into direct human authorship.

### Publish/contribute distinct from mutate

Treat these as different capabilities:

```text
read
contribute/publish
mutate
```

An agent or external participant may add attributable knowledge or propose a revision without receiving authority to rewrite existing canonical information.

### One governed write seam

All mutation/contribution surfaces should converge on the same core path:

```text
identity -> authority -> validation/conflict handling -> revision or proposal -> provenance
```

Interfaces should not independently invent permission semantics.

## Important mismatch

OpenLore's central abstraction is a governed shared corpus exposed substantially as files/docsets. Loom's information model is richer: durable document identity and revision history, project participation, visibility/disclosure semantics, compression versus full content, human/agent/system provenance, contribution and retraction semantics, and increasingly claims/disputes and disclosure history.

Therefore the filesystem idea is most useful as an **agent projection of Loom**, not as Loom's canonical data model.

## Broader inference

OpenLore, current discussion of "multiplayer AI," and the 2026 OpenAI/Hugging Face agent incident all point toward the same architectural pressure: isolated per-agent context is a poor unit for sustained collaborative work. A persistent, permissioned, provenance-preserving shared information environment may be a more fundamental primitive.

This is an inference for Loom, not a claim made by OpenLore.
