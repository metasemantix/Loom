# Healthcare interoperability

## Idea

Loom could interface with state- and provider-controlled healthcare systems while remaining a patient-controlled continuity layer rather than trying to replace the electronic patient record.

Conceptually:

```text
medical systems <-> patient-controlled Loom project <-> patient / authorized agents
```

## Potential role

A `health` project could contain original medical documents alongside longitudinal user-authored observations, medication/substance effects, hypotheses, questions, contradictions, disputes, decisions, and agent-generated compressions with provenance.

Loom could import and export established healthcare formats where practical (for example FHIR-based representations), but imported structured data must retain its source and assertion status.

## Architectural boundary

Interoperability must not make the external healthcare system Loom's source of truth.

An imported provider statement remains an imported provider statement. A Loom export is a disclosure of selected Loom material, not an implicit transfer of ownership over the underlying corpus.

## Possible capabilities

- import external medical documents and structured records with provenance
- preserve source identifiers and timestamps
- export selected records in interoperable formats
- generate human-readable handoff packets
- connect disclosure grants and snapshots to external recipients
- maintain an audit trail of what crossed the boundary

## Status

Exploratory. Standards and jurisdiction-specific integrations require separate investigation before implementation.
