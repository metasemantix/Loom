# Disclosure snapshots

## Idea

Loom should support purpose-built, reviewable disclosure snapshots: bounded exports of selected project information created for a particular recipient or purpose.

Examples in a health project:

- neurology handoff
- emergency medication summary
- new-therapist context
- selected longitudinal symptom history

## Semantics

A snapshot is not equivalent to granting live corpus access. It records exactly what information was disclosed at a point in time.

Useful properties could include:

- source documents/revisions used
- generated compression or summary, if any
- recipient and purpose
- creator/approver provenance
- creation and disclosure timestamps
- immutable snapshot hash or version
- explicit indication of omitted material where useful

Human approval should be possible before an agent-generated packet leaves the project.

## Why this matters

Loom cannot control copies after disclosure, but it can make the disclosure boundary explicit and auditable. This also reduces the need to grant broad live access when a finite packet is sufficient.

## Status

Exploratory.
