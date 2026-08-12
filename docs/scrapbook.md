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
