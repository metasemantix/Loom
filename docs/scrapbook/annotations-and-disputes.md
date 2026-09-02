# Annotations and disputes

## Idea

Loom should let participants annotate or dispute an attributable claim or document without modifying or deleting the source material.

For healthcare, this allows a clinician's record and the patient's correction or disagreement to coexist:

```text
Provider assertion: ...
Patient clarification: ...
Patient disputes: ...
```

Neither side overwrites the other.

## Why this matters

Revision history protects a document against silent rewriting, but it does not by itself represent disagreement between independently authored accounts. Loom needs a way to say "this source says X; another participant contests X" while preserving both provenance chains.

## Possible properties

- annotation targets a stable document/revision/claim identifier
- author and timestamp are immutable provenance
- annotation type may distinguish clarification, dispute, support, correction request, or contextual note
- source content remains intact
- agents can retrieve disputes alongside the material they qualify

## Open question

Avoid accidentally building a universal adjudication system. Loom may need to preserve disagreement without deciding who is correct.

## Status

Exploratory.
