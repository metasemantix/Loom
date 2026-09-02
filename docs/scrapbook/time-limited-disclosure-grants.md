# Time-limited disclosure grants

## Idea

Loom should be able to grant temporary, purpose-specific access to selected information without turning disclosure into permanent project membership.

A disclosure grant is a capability with explicit scope, permissions, and lifetime. It may be issued to a human professional, institution, agent, or other external participant.

## Example

A healthcare grant might resemble:

```text
scope: health/neurology
read: selected
write: contributions-only
expires: 2026-09-16
```

## Important boundary

Revocation can terminate future Loom access, but it cannot truthfully promise deletion of information a recipient has already exported or lawfully copied into another system. Loom should make that boundary explicit rather than pretending revocation is retroactive erasure.

## Questions

- Can a grant cover logical paths, document sets, metadata layers, or all three?
- Should recipients be able to delegate any part of a grant? Default likely no.
- What exactly is logged when a grant is exercised?
- Can a grant require a fresh disclosure snapshot rather than live corpus access?

## Status

Exploratory.
