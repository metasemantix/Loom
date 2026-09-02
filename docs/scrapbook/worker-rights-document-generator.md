# Worker-rights document generator

Status: exploratory scrapbook idea, not adopted architecture.

## Idea

Build a low-friction document generator for common employment-rights disputes. The immediate inspiration is a recurring asymmetry: an employer can make a disputed decision (for example withholding sick pay) cheaply and at scale, while each affected worker must individually understand the issue, formulate a response, track deadlines, and decide whether escalation is worth the effort.

The useful intervention is therefore not necessarily new substantive rights. It is to reduce the transaction costs of exercising rights that already exist.

A first version should be deliberately boring and deterministic rather than an AI lawyer:

1. Ask a small set of fact questions relevant to a defined problem type.
2. Route answers through a pre-written, professionally reviewed decision tree.
3. Explain why each requested fact matters where useful.
4. Assemble an appropriate response from reviewed text modules.
5. Produce a human-readable letter that the user can inspect, edit, and send themselves.
6. Stop rather than improvise when the case crosses a safety boundary, such as a short statutory deadline or a question requiring individualized legal assessment.

Possible initial problem types include withheld remuneration or continued remuneration during sickness, disputed medical certificates, requests for medical disclosure, overtime disputes, leave disputes, warnings, and other common employer actions. Each should be implemented independently rather than hidden behind a general-purpose legal chatbot.

## Legal-service boundary

The design should explicitly investigate the boundary between general legal information / document automation and individualized legal advice under the German Rechtsdienstleistungsgesetz (RDG).

A conservative implementation would avoid having an LLM decide whether an employer acted unlawfully, predict success, or independently subsume a user's narrative under legal rules. Instead, legal experts would define the decision tree and approved text modules in advance. A public deployment should receive qualified review of both the legal content and the interaction design.

A disclaimer is not a substitute for designing the service so that its actual behavior stays within the intended legal boundary.

## Structured case reporting

An optional second function could let users contribute a minimal, structured account of what happened, preferably separable from identifying documents and with explicit consent.

Example fields:

```text
problem_type: continued_pay_withheld
employer_reason: continuation_illness_disputed
medical_certificate_present: yes
medical_disclosure_requested: yes
response_sent: 2026-09-02
outcome: paid | refused | no_response | litigation | unknown
```

Aggregated reports could turn otherwise isolated disputes into evidence about recurring practices: how often a measure occurs, which justifications are used, how often workers challenge it, what happens after challenge, and which patterns deserve union, journalistic, regulatory, or legal attention.

This makes the generator potentially useful as both an individual friction-reduction tool and a collective early-warning instrument.

## Institutional version

A DGB- or union-operated version is an obvious institutional model because unions already combine employment-law expertise, legal representation, and knowledge of recurring workplace practices. A public first-stage generator or triage tool could lower the threshold for non-members while preserving full legal advice and representation as a separate service.

The concept is not dependent on union operation, however. A narrowly scoped open-source generator with professionally reviewed content is also worth investigating.

## Loom connection

The generator itself does not require Loom. The Loom-shaped extension is a worker-controlled case record that can preserve:

- source documents and provenance;
- employer claims as claims rather than canonical facts;
- the worker's annotations and disputes;
- relevant dates and deadlines;
- generated and sent correspondence;
- responses and outcomes;
- selective disclosure to a union, lawyer, adviser, or other participant.

This could reuse Loom concepts such as provenance, scoped access, disclosure snapshots, external professional participants, and claims-not-canonical-facts without making the legal generator dependent on the full platform.

A particularly useful principle is that the worker retains the longitudinal record while professionals receive only the material needed for the current purpose.

## Broader pattern

The deeper design target is **rights with asymmetric enforcement costs**.

A formally available right can be weak in practice when exercising it requires substantially more knowledge, time, money, confidence, or procedural work from the individual than violating or contesting it costs the better-resourced counterparty. Structured automation can attack that asymmetry directly by making routine assertion of rights cheap and repeatable.

That pattern may generalize beyond employment law to consumer disputes, tenancy, benefits administration, insurance, accessibility claims, and other domains. Those extensions should be investigated separately rather than assumed to share the same legal or procedural architecture.

## Open questions

- Which employment disputes are sufficiently standardized for safe deterministic generation?
- Where exactly does the RDG boundary fall for interactive document assembly, triage, and optional AI assistance?
- Which deadlines or fact patterns should force an immediate stop-and-escalate path?
- Who maintains and versions the legal decision trees as statutes and case law change?
- How can structured reporting produce useful aggregate evidence without becoming a repository of unnecessary sensitive data?
- What consent and anonymization model would permit collective pattern detection?
- Should generated letters carry a machine-readable schema/version identifier so outcomes can later be compared?
- Can unions publish reviewed decision trees as open infrastructure while reserving individualized representation for members?
- Which parts belong in Loom, and which should remain a standalone public utility?
