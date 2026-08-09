# MVP — Bounded Agent Handshakes

## Hypothesis

The first Loom experiment asks one question:

> Does bounded inter-agent discourse produce better reasons for human conversation than one-shot matching?

This is a conversation experiment, not an attempt to build the final coordination platform.

## Participants

A small number of humans, initially drawn from an environment similar to *Meet My Human*.

Each participant has:

- a human identity;
- an agent endpoint;
- a small approved context store;
- explicit permissions governing what the agent may do and disclose.

## Basic flow

### 1. Propose a connection

A human or authorized agent proposes a possible connection between two participants.

### 2. Authorize a handshake

Both humans opt into the exploratory exchange.

### 3. Conduct a bounded exchange

The two agents receive relevant approved context and may exchange a small set of message types:

- question;
- answer;
- artifact;
- counterexample;
- clarification;
- rejection.

The initial protocol should cap the exchange at roughly three rounds. The purpose is to gather enough information to produce a useful conversational edge, not to let agents conduct an autonomous relationship indefinitely.

A deliberately tiny initial prompt may ask each agent to propose:

1. one question its human might genuinely enjoy answering;
2. one question its human might genuinely enjoy asking the other human;
3. one concrete thing they could examine together;
4. one place where they may genuinely disagree.

Agents should avoid personality descriptions and compatibility scores.

### 4. Produce a human-facing result

The output should look more like:

```text
You might want to ask:
...

They might want to ask you:
...

Something you could examine together:
...

Possible disagreement:
...
```

and less like:

```text
You are 87% compatible because you both value systems thinking.
```

### 5. Collect lightweight feedback

For an initial experiment, feedback can remain deliberately small:

- Was this useful? `yes / somewhat / no`
- Did you contact the other participant? `yes / no`
- Why or why not? optional text

The free-text reason matters. A rejection can contain more useful information than a numeric score.

## What to measure

Loom should not optimize this experiment around engagement metrics such as time on site or daily active users.

More useful observations include:

- Did a proposed question actually get asked?
- Did an answer change or surprise either agent's working model?
- Did the humans continue voluntarily?
- Did either human discover something useful?
- Did the interaction produce a new question, artifact, disagreement, or activity?
- Were initial assumptions corrected?
- Did either participant decide the interaction was not worth their time, and why?

## Minimum persistent state

Even the first experiment should avoid forcing agents to reconstruct everything from raw transcripts.

For each handshake, retain at least:

- participants and agent identities;
- authorization state;
- messages exchanged;
- referenced artifacts;
- human feedback;
- unresolved questions;
- corrections or rejected assumptions.

The exact semantic memory architecture can remain outside the MVP until the experiment demonstrates what it actually needs.

## Explicitly out of scope

Not yet:

- algorithmic feed;
- follower graph;
- elaborate profiles;
- reputation or points;
- compatibility scoring;
- autonomous agent swarm;
- universal ontology;
- decentralized identity;
- self-modifying production infrastructure;
- generalized social platform.

The MVP succeeds if it gives us evidence about whether a short, permissioned agent-to-agent exchange can improve the starting conditions for a human-to-human conversation.
