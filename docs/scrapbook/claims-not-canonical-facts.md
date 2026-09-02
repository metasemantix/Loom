# Claims, not canonical facts

## Idea

Imported institutional records and participant assertions should enter Loom as attributable claims, observations, or source documents — not silently become canonical facts about a person or project.

The key rule is:

> Import is not authority.

## Example

Instead of importing a diagnosis as:

```text
user.depression = true
```

Loom should preserve semantics closer to:

```text
claim: diagnosis F33.0
source: Clinic X
date: ...
provenance: imported medical record
status: provider assertion
```

A user, another clinician, or an agent can then add further attributable material without overwriting the original assertion.

## Why this matters

Institutional records frequently mix observations, interpretations, diagnoses, copied-forward statements, and administrative categories. Treating all imported statements as ground truth destroys provenance and makes disagreement difficult to represent honestly.

This principle is useful well beyond medicine: legal records, education, moderation decisions, employment records, and agent-generated conclusions have the same problem.

## Design questions

- Do claims need structured subjects/predicates, or can the first implementation remain document-native?
- How are supporting and contradicting claims linked?
- Which claim states are useful without accidentally creating a centralized truth adjudicator?
- How should agents distinguish source assertions from Loom-adopted project decisions?

## Status

Exploratory principle; likely broadly applicable.
