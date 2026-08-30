# Current Codex Task

Implement the current bounded Loom slice: **local-development authentication bypass for developer QoL**.

Read and follow `AGENTS.md` and inspect the existing authentication/session architecture before changing code. Preserve all existing production authentication and authorization semantics.

## Goal

Make local Loom usable without going through Discord on every development machine while continuing to exercise Loom's real participant/session/authorization machinery.

## Required behavior

- Add an explicit local-development auth mode controlled by a local development variable such as `DEV_AUTH_BYPASS=1`.
- The bypass must be impossible to activate in deployed/non-local Loom merely by setting that variable. Require both the explicit opt-in and a trustworthy local-development condition such as localhost/Wrangler-local execution, and fail closed otherwise.
- Do **not** bypass Loom authorization checks. Instead, establish a normal Loom session for one fixed deterministic development participant so ownership, project roles, archive/deletion rules, and all existing authorization behavior continue to run normally.
- If the deterministic development participant is missing from a fresh local database, create it automatically with stable deterministic identity/provenance suitable for repeated local use.
- Reuse the same participant on subsequent starts; do not create duplicates.
- Keep this first version deliberately single-user. Do not add identity switching or multi-user reference-world controls in this slice.
- In dev-auth mode, visiting local Loom should require no Discord interaction. Establish/use the development session automatically and proceed into the application.
- Make active dev-auth mode clearly visible in the local UI with a small conspicuous `DEV AUTH` indicator so there is no ambiguity about which authentication mode is active.
- With the bypass disabled, existing Discord authentication behavior must remain unchanged.
- Document the local-development option in `README.md` and `.dev.vars.example`. Do not commit real secrets.

## Acceptance and regression requirements

Add focused tests covering at minimum:

- bypass disabled -> existing authentication behavior remains unchanged;
- bypass enabled in genuine local development -> deterministic development participant/session is established;
- missing development participant is created automatically;
- existing development participant is reused rather than duplicated;
- non-local/deployed context cannot activate the bypass even when `DEV_AUTH_BYPASS=1` is present;
- authenticated requests after dev login still resolve identity through normal Loom participant/session machinery and do not skip authorization checks;
- the local UI visibly identifies dev-auth mode.

Use the existing testing conventions and browser/rendered-JS guidance in `AGENTS.md`. Investigate discrepancies rather than weakening tests or inventing new production auth policy.

Do not expand this slice into agent authentication, production auth redesign, multi-user dev switching, reference-world identity switching, notifications, or unrelated setup tooling.

Run all validation required by `AGENTS.md`. At completion, report what changed, tests added or updated, any defects or genuine architecture ambiguities discovered, and validation results.
