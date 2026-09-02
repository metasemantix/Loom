# External professional participants

## Idea

Loom should support narrowly scoped external professional participants such as clinicians, therapists, lawyers, social workers, or other institutional actors without treating them as ordinary project members.

A professional participant should receive only the project paths and capabilities explicitly granted for a defined purpose. Their access should not imply ambient access to the whole project or corpus.

## Why this matters

For healthcare, a patient-controlled Loom project could sit beside state or provider-controlled records. A neurologist might need access to `health/neurology`, while a dentist should not automatically see psychotherapy material or unrelated records.

The professional should contribute attributable observations, assessments, recommendations, or documents without gaining authority to silently rewrite the user's corpus.

## Possible semantics

- distinct external/professional participant type
- explicit organization and human provenance
- path- or document-scoped read access
- contribution-only or narrowly scoped write access
- expiry and revocation independent of project membership
- immutable attribution for contributed claims

## Status

Exploratory. This is not yet an adopted authorization model.
