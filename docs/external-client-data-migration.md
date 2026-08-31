# External Client Data Migration Roadmap

This note describes a small, practical path for moving one slice of an external application's state into Loom without requiring the entire client application to adopt Loom at once.

The first useful test case is low-volume shared structured state such as a shopping list. The client itself is intentionally unspecified. The point is to define the Loom-side capabilities and migration pattern in a reusable way.

## Goal

Move one self-contained feature from an existing application database into Loom while preserving the existing client UI and leaving unrelated data where it is.

This is not a proposal to make Loom a drop-in replacement for Firestore, SQLite, Postgres, or any other application database. Loom's current strength is document-oriented, revisioned, permission-aware storage. The first migration should stay close to that model and expose where additional application-state capabilities are genuinely needed.

## First slice: one JSON document

A simple shared list can be represented as one JSON document, for example:

```json
{
  "schemaVersion": 1,
  "lists": [
    {
      "id": "list_xxx",
      "name": "Groceries",
      "emoji": "🛒",
      "items": [
        {
          "id": "item_xxx",
          "text": "Milk",
          "createdAt": "2026-08-31T08:30:00.000Z"
        }
      ]
    }
  ]
}
```

The exact schema belongs to the client, not Loom. Loom should store and version the document without needing to understand application-specific fields.

A logical path such as `app/shopping.json` is sufficient for a first implementation.

## Concrete migration sequence

### 1. Define the document contract

Choose a stable JSON schema for the feature being migrated.

Keep the first schema deliberately boring:

- explicit `schemaVersion`
- stable IDs for lists/items/records
- ISO timestamps where timestamps are needed
- no dependency on Loom-specific internal IDs inside the application payload unless necessary

The migration should preserve existing record IDs where possible so that the client does not need to reinterpret its own data after the move.

### 2. Give the external client a narrow Loom access path

A browser application on another origin cannot rely on Loom's normal browser cookie session plus same-origin write protection.

Loom therefore needs an application/session credential suitable for external clients.

For the first slice, this should be intentionally narrow rather than a complete general-purpose agent-auth system. A credential should be scopeable to the smallest useful capability set, for example:

- read one document or logical path
- create the document if absent
- update its contents
- optionally delete it
- expire after a defined period or be revocable

A future capability model can generalize this, but the initial migration does not need to solve every agent-auth problem first.

### 3. Add a storage boundary in the client

The client UI should stop talking directly to its old database for the migrated feature.

Instead, introduce a tiny feature-level storage interface such as:

```text
loadState()
saveState(state)
```

or a similarly small domain-specific API.

Initially the existing database adapter can implement that interface unchanged. This separates the UI refactor from the backend migration and provides an easy rollback path.

Do not begin by making the entire client storage layer generic. The first abstraction should cover only the feature actually being migrated.

### 4. Implement the Loom adapter

The Loom-backed implementation should:

1. fetch the JSON document,
2. parse it into the client's existing state shape,
3. serialize changed state back to JSON,
4. update the Loom document.

For low-frequency state such as a household shopping list, replacing the complete JSON document is acceptable as a first implementation.

This pattern should not automatically be extended to high-frequency or append-heavy workloads.

### 5. Migrate existing data once

Use a disposable migration script or one-shot administrative operation to:

1. read the old database records,
2. transform them into the agreed JSON schema,
3. preserve stable IDs and useful timestamps,
4. write the resulting document into Loom,
5. compare the Loom result against the source data before cutover.

The migration tooling is not part of the runtime client and may be discarded after the move once the result is verified.

### 6. Cut over with rollback available

Keep the old backend intact initially.

A useful rollout sequence is:

1. old backend through the new storage abstraction,
2. Loom backend behind a feature flag or configuration switch,
3. migrate data,
4. test Loom reads and writes with real client usage,
5. switch the feature's default backend to Loom,
6. stop writes to the old backend,
7. remove old feature-specific database code only after confidence is high.

A temporary dual-write mode may be useful for validation, but it should be short-lived: permanently maintaining two authorities creates more failure modes than it removes.

## Concurrency: do not silently overwrite newer state

A whole-document JSON update introduces a lost-update risk.

Example:

1. Client A reads version 7.
2. Client B reads version 7.
3. Client A writes and creates version 8.
4. Client B writes its stale copy and accidentally erases A's change.

Loom should therefore support optimistic concurrency for external application writes.

The client should be able to say, effectively:

```text
update this document only if the current version is still 7
```

If the document has changed, Loom should reject the update with a conflict response rather than silently accepting it.

The client can then reload current state, reconcile or reapply its small local change, and retry.

This could be represented through an expected-version field, `If-Match`, or another explicit precondition. The exact transport syntax is less important than the invariant: stale writes must be detectable.

## Realtime behavior

Existing application databases often provide realtime subscriptions. Loom's current document API is request/response oriented.

For the first low-frequency migration, this does not require a realtime subsystem. A client can:

- reload after its own writes,
- refresh when the view becomes active,
- poll at a modest interval while the feature is visible.

If external clients later demonstrate a real need for realtime updates, Loom can add a change feed, server-sent events, WebSockets, or another subscription mechanism based on observed workloads rather than speculation.

## Data ownership choice

External application state may be stored either as participant-owned documents contributed to a project or as project-native documents.

This choice should remain deliberate.

Participant-owned documents are appropriate when the state has a meaningful human/source owner and should continue to follow that owner's permission, retraction, and deletion state.

Project-native documents are appropriate when the data genuinely belongs to the shared project rather than to one contributing participant.

The migration pattern itself should work with either ownership model; it should not quietly redefine ownership merely because the data originated in an application database.

## What not to migrate using this pattern yet

One JSON document works well for small, low-frequency structured state. It is a poor fit for several other workloads.

### High-frequency scratchpads or drafts

If a client autosaves every few hundred milliseconds, mapping every save to a new immutable Loom document version would create revision noise and unnecessary storage churn.

Possible future answers include coarser client saves, a distinction between draft-state writes and meaningful revisions, or a structured application-state capability in Loom.

### Chat and append-heavy event streams

A continually growing message history should not become one repeatedly rewritten JSON document. It will eventually run into document-size limits, expensive rewrites, awkward concurrent edits, and poor retrieval characteristics.

Segmented documents may work as an interim solution, but appendable structured records or another application-state primitive are likely a better long-term model.

### Device-local UI state

Selection state, local unread markers, ephemeral caches, and similar device-specific data should not migrate merely because Loom is available. Data should move only when shared persistence, provenance, coordination, or agent access actually benefits from Loom.

## Minimal implementation roadmap

A practical first implementation can be split into small independent changes:

1. **Loom:** scoped external-client/session authentication.
2. **Loom:** optimistic concurrency for document updates.
3. **Client:** feature-level storage abstraction preserving current behavior.
4. **Client:** Loom adapter behind a configuration switch.
5. **Migration:** transform and import existing feature data.
6. **Cutover:** switch reads/writes to Loom while retaining rollback.
7. **Cleanup:** remove obsolete feature-specific code from the old backend.

The important part is the order: Loom establishes a narrow, safe contract; the client gains a backend seam; one real workload crosses that seam; and only then do observed limitations justify broader database-like capabilities.

## Why start this small

The first external client should act as a probe for Loom's architecture rather than as a reason to pre-design a universal application database.

A small shared-state migration can reveal concrete answers to questions such as:

- Are scoped external credentials ergonomic enough?
- Is whole-document versioning pleasant for real application state?
- How often do conflicts actually occur?
- Is polling sufficient for low-frequency shared state?
- Where does document storage stop being the right primitive?
- Which future structured-data capability would solve demonstrated pain rather than hypothetical pain?

That makes the first migrated feature useful twice: once as application functionality, and once as evidence for Loom's next layer of design.
