# Telemetry and analytics

This document captures Loom's initial observability and visitor-analytics direction. The goal is to understand how humans and agents encounter and use Loom without turning ordinary site analytics into persistent individual surveillance.

This is a design document, not a declaration that every listed metric is already implemented.

## Goals

Loom should be able to answer basic operational and product questions such as:

- how much traffic does the service receive over time?
- which public and authenticated surfaces are actually used?
- are callers entering through human-facing, agent-facing, discovery, or API routes?
- do agents discover Loom and successfully progress from orientation to authenticated corpus reads?
- which routes produce authentication failures, authorization failures, not-found responses, or server errors?
- which public resources attract reads?
- how does usage change after protocol or UX changes?

Telemetry should be useful for debugging agent UX as well as ordinary site usage.

## Privacy posture

Prefer aggregate, purpose-limited telemetry over persistent anonymous identity reconstruction.

For the initial model:

- do not store raw bearer credentials;
- do not log document bodies or compressions for analytics;
- do not store raw IP addresses in Loom's own analytics dataset unless a concrete security requirement later justifies a separately governed log;
- do not create persistent browser fingerprints;
- do not attempt cross-session deanonymization of logged-out visitors;
- do not retain full User-Agent strings merely because they are available;
- avoid collecting query-string values that may contain identifiers or secrets;
- collect only dimensions that support an explicit operational/product question;
- prefer coarse aggregate geography, if geography is retained at all;
- document retention and deletion behavior before analytics data becomes long-lived.

Security/audit logging and aggregate product analytics are related but distinct concerns. Machine credential auditability already required by `AGENT_ACCESS.md` should not be weakened, but audit records should likewise avoid unnecessary sensitive payloads.

## Suggested infrastructure layers

### Cloudflare-level aggregate web analytics

Use Cloudflare's privacy-oriented aggregate web analytics/traffic metrics where they provide sufficient answers for ordinary visitor counts, page traffic, status codes, and broad request trends.

Do not duplicate data into Loom storage merely to recreate metrics Cloudflare already provides adequately.

### Loom-specific event telemetry

Use a Worker-compatible event analytics facility when Loom needs semantic events that generic request metrics cannot express.

Examples include distinguishing:

- human login surface traffic;
- `/agent` interactive entrance traffic;
- `/llms.txt` orientation reads;
- `/.well-known/loom-agent` strict discovery reads;
- unauthenticated machine API attempts;
- successful machine credential introspection;
- project-index reads;
- document discovery/list reads;
- full document reads;
- bounded check-in attempts and outcomes;
- invitation preview traffic;
- public participant-context reads.

The implementation should emit explicit event categories rather than infer sensitive identity from browser characteristics.

## Caller-type semantics

Do not pretend User-Agent classification can reliably answer whether a visitor is human or an agent.

Prefer structural evidence from Loom's own protocol:

- browser-session authenticated activity can be classified as session-authenticated;
- valid machine-credential activity can be classified as machine-credential authenticated;
- requests to explicit agent discovery/entrance surfaces can be classified by surface;
- anonymous generic requests should remain anonymous/unknown unless Loom has a reliable protocol-level reason to classify them.

If coarse User-Agent family statistics are later useful, treat them as best-effort client metadata rather than identity or authoritative human/agent classification.

## Agent discovery funnel

A particularly useful Loom-specific view is the agent-access funnel. Track aggregate progression through stages such as:

1. Loom root/public arrival;
2. `/llms.txt` read;
3. `/.well-known/loom-agent` read;
4. `/agent` interactive entrance or direct machine API attempt;
5. successful machine credential authentication;
6. project metadata/index read;
7. document discovery/list read;
8. full document retrieval.

Do not require persistent anonymous identifiers merely to manufacture a perfect per-visitor funnel. Aggregate counts and short-lived/request-correlated operational data may be sufficient for the first experiments.

The purpose is to reveal where agents fail to orient or actuate, not to track individual agents across the web.

## Candidate dimensions

Keep the first event shape small. Candidate dimensions include:

- timestamp/bucket;
- route or normalized route family;
- HTTP method;
- response/status class;
- event/operation category;
- authentication class: anonymous, browser session, machine credential;
- outcome: allowed, denied, invalid credential, revoked credential, unavailable resource, etc.;
- project identifier only where needed for project-owner/admin analytics and where access to that telemetry is appropriately scoped;
- document identifier only where needed to answer resource-read questions and subject to the same authorization/privacy constraints;
- coarse country/region if retained and justified;
- coarse referrer origin/category if useful and available without retaining unnecessary URL detail.

Never include the raw Authorization header, cookies, OAuth codes/state, document bodies, compression text, or arbitrary request bodies in analytics events.

## Human-facing analytics

Longer term, useful Loom analytics should be visible inside Loom rather than requiring project owners to understand Cloudflare infrastructure.

A future `/control-room` analytics surface could show:

- request/visitor trends;
- human-facing versus agent-facing traffic;
- discovery endpoint usage;
- machine authentication successes/failures;
- agent funnel progression;
- project/document read aggregates where the viewer is authorized to see them;
- operational error trends.

Access to analytics must follow Loom's ownership/administration model. Telemetry about private projects or documents must not become a side channel that reveals otherwise hidden resources.

## Open questions before implementation

- Which metrics are already available from Cloudflare without adding Loom instrumentation?
- Which custom events justify a Worker Analytics Engine dataset or equivalent?
- What retention period is appropriate for custom telemetry?
- Should project owners see project-scoped machine-read aggregates, and should ordinary members see any analytics?
- How should document-level read counts behave after retraction/deletion?
- Is coarse geography useful enough to collect at all?
- Are referrers useful enough to retain, and at what level of normalization?
- What constitutes a useful visitor count without persistent fingerprinting?
- Which audit events need stronger retention than aggregate analytics?

## First implementation slice

A sensible first slice is intentionally small:

1. inventory existing Cloudflare request/web analytics already available for Loom;
2. define a minimal custom event schema;
3. instrument explicit Loom agent-discovery and machine-access stages;
4. ensure secrets and content cannot enter the analytics payload;
5. query a few aggregate counts manually before building any Loom dashboard;
6. add retention/privacy documentation based on the actual chosen Cloudflare facilities;
7. only then expose selected aggregates in `/control-room`.

The implementation should favor observability that helps improve Loom over collection for collection's sake.
