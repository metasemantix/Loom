# Loom Protocol 0.1

This document defines the first generic message envelope used by Loom participants and the first procedure built on top of it: a bounded exploratory handshake between two personal agents.

The protocol is intentionally small. Loom should standardize what participants need in order to coordinate, not how an agent thinks.

## 1. Design goals

`loom/0.1` should be:

- **generic** — the envelope is not specific to matchmaking, introductions, or any particular application;
- **model-independent** — participants may use different hosted models, local models, custom agents, or ordinary software;
- **human-readable** — a message should remain intelligible without specialized tooling;
- **easy to implement** — a participant should not need a Loom SDK to speak Loom;
- **extensible** — new procedures and message types should not require redesigning the envelope;
- **explicit about identity** — agents do not impersonate humans;
- **explicit about human boundaries** — a message can signal that further progress requires human involvement.

The protocol deliberately does not attempt to encode every semantic distinction an LLM can understand from ordinary language.

## 2. Generic message envelope

A minimal Loom message looks like this:

```json
{
  "protocol": "loom/0.1",
  "id": "msg_01J...",
  "object": "obj_01J...",
  "sender": "agent:alice",
  "recipient": "agent:bob",
  "type": "question",
  "content": "What problem is your human currently thinking about where one changed constraint alters the whole system?",
  "references": [],
  "requires_human": false
}
```

### Required fields

#### `protocol`

Protocol version used to interpret the envelope.

For this document:

```text
loom/0.1
```

#### `id`

Unique identifier for this message.

Loom does not require a particular identifier scheme in 0.1. UUIDs, ULIDs, or another collision-resistant scheme are acceptable.

#### `object`

Identifier of the shared object to which the message belongs.

An object is the coordination context around which messages accumulate. It might represent a proposed connection, a research question, a project, an investigation, or another shared purpose.

The envelope does not prescribe what kind of object it is.

#### `sender`

Identifier of the participant sending the message.

Participant identifiers should make agent identity distinguishable from human identity. The exact identifier scheme remains implementation-defined in 0.1.

#### `recipient`

Identifier of the intended participant.

0.1 assumes one recipient per message. Broadcast and group addressing are deliberately deferred.

#### `type`

A lightweight description of what the message is doing.

Initial types are:

- `question`
- `answer`
- `artifact`
- `clarification`
- `counterexample`
- `rejection`

This vocabulary is intentionally not exhaustive. Implementations should tolerate unknown types rather than treating the initial list as a closed ontology.

#### `content`

Human-readable message content.

For 0.1 this is plain text. Structured payloads may later be added where demonstrated use cases require them.

### Optional fields

#### `references`

Identifiers or links to messages, artifacts, evidence, or other objects relevant to the message.

An empty list is valid.

#### `requires_human`

Boolean indicating that the sender believes progress on this message requires human involvement or authorization.

This is a coordination signal, not a permission system by itself.

## 3. What is deliberately absent

The 0.1 envelope does not contain:

- compatibility scores;
- personality models;
- hidden chain-of-thought;
- model-provider metadata;
- universal confidence scores;
- reputation scores;
- social graph primitives;
- workflow-specific fields;
- a universal ontology of human intentions.

If repeated real use demonstrates that one of these distinctions belongs at the protocol boundary, it can be proposed later.

## 4. Procedures live above the envelope

The envelope answers:

> How can one Loom participant send another participant a message about a shared object?

It does not answer:

> What conversation are they conducting?

That belongs to a procedure.

A procedure defines rules for a particular kind of coordination while reusing the generic `loom/0.1` envelope.

The first procedure is `handshake/0.1`.

---

# Handshake 0.1

## 5. Purpose

`handshake/0.1` is a bounded exploratory exchange between two personal agents whose humans may have something worth discussing.

Its purpose is not to determine whether two humans are compatible.

Its purpose is to discover one or more **conversational edges**: concrete reasons an interaction might contain information, surprise, useful disagreement, shared investigation, or collaborative potential.

Examples include:

- a question one human may genuinely enjoy answering;
- a question one human may genuinely want to ask the other;
- an artifact worth examining together;
- an unresolved problem;
- a concrete example that challenges an assumption;
- a suspected disagreement worth testing.

## 6. Preconditions

Before an exploratory handshake begins:

1. the two human participants have been identified;
2. both humans have authorized the handshake, or have previously granted permission that explicitly covers this kind of bounded handshake;
3. each agent has an approved context from which it may represent its human;
4. neither agent is authorized merely by participating in the handshake to make commitments on behalf of its human or disclose information outside its existing permissions.

The permission mechanism itself is outside the 0.1 message envelope.

## 7. Exchange rules

A handshake is limited to **three rounds** by default.

A round consists of one message from each participating agent. Implementations may terminate earlier when either agent rejects the interaction, requires human input, or determines that no useful next probe exists.

Agents should preferentially exchange:

- questions;
- concrete examples;
- artifacts;
- counterexamples;
- clarifications;
- unresolved problems;
- suspected disagreements.

Agents should avoid spending the exchange producing abstract descriptions of the humans.

In particular, the procedure should not reward statements such as:

> Both humans value thoughtful exploration of complex systems.

when a more informative probe can be made.

A useful heuristic is:

> Ask for the information that would most change your current model of whether these humans have something worth discussing.

## 8. Agent conduct

During the handshake, an agent:

- speaks as an agent, not as its human;
- does not fabricate its human's views;
- does not make commitments for its human;
- does not silently expand its disclosure permissions;
- may challenge or correct the other agent's characterization of its human;
- may reject a question or request;
- may indicate that human input is required;
- should preserve uncertainty when its context does not support a confident answer.

Human corrections override an agent's intended representation of that human. Historical observations and prior inferences may remain separately preserved by the surrounding memory system where appropriate; they should not be silently rewritten as though they never occurred.

## 9. Example exchange

Agent A begins:

```json
{
  "protocol": "loom/0.1",
  "id": "msg_001",
  "object": "connection_17",
  "sender": "agent:a",
  "recipient": "agent:b",
  "type": "question",
  "content": "Give me one problem your human is currently thinking about where changing a single constraint unexpectedly changes the whole system.",
  "references": [],
  "requires_human": false
}
```

Agent B responds with a concrete example.

Agent B might then ask:

```json
{
  "protocol": "loom/0.1",
  "id": "msg_002",
  "object": "connection_17",
  "sender": "agent:b",
  "recipient": "agent:a",
  "type": "question",
  "content": "Give me an analogy your human currently suspects might be useful but has not managed to break yet.",
  "references": ["msg_001"],
  "requires_human": false
}
```

The exchange continues only while another probe is likely to add useful information, up to the procedure limit.

## 10. Human-facing result

At the end of the handshake, the agents should produce a compact result for their humans.

The result should not be a compatibility score.

A useful initial shape is:

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

Fields with no supported result may be omitted. Agents should not manufacture an entry merely to complete the template.

## 11. Feedback

The MVP should collect lightweight human feedback after the result is shown.

At minimum:

```text
Useful?
yes / somewhat / no

Did you contact them?
yes / no

Why?
optional text
```

A rejection should preserve the reason where one is supplied. `no` is not merely a negative score; the explanation may contain the most useful information produced by the experiment.

## 12. Interoperability requirement

Two systems should be considered capable of participating in the first Loom experiment if they can:

1. send and receive the generic `loom/0.1` envelope;
2. identify themselves as agents rather than humans;
3. associate messages with a shared object;
4. respect the handshake's authorization and round limits;
5. understand the initial message types or safely tolerate unfamiliar ones;
6. expose the resulting conversational edges to their humans.

They do **not** need to use the same model, memory architecture, prompt, hosting provider, programming language, or internal reasoning process.

## 13. Open questions

0.1 intentionally leaves several things unresolved:

- How are participant identities established and verified?
- How are agent endpoints discovered?
- How are permissions represented and proven across systems?
- Should procedures themselves have machine-readable identifiers in each message?
- How should artifacts be addressed and transferred?
- How should asynchronous handshakes expire or resume?
- How should group objects work?
- Which parts of a handshake become persistent relationship memory?
- How should an agent communicate uncertainty in a portable way when ordinary language is insufficient?

These are not omissions to be filled speculatively. They are questions for implementation and experiment to answer.

## 14. Versioning principle

`0.1` is experimental.

Changes should be driven by observed coordination failures or repeated implementation friction rather than by attempts to anticipate every future Loom use case.

The protocol should remain straightforward enough that an independent agent developer can read this document and implement a participant without first adopting the rest of Loom's architecture.
