# Current Codex Task

Implement a minimal GitHub Actions CI workflow for Loom so the repository's standing test battery runs automatically on pull requests and pushes to `main`.

Read and follow `AGENTS.md` and `docs/TESTING_MODEL.md`. This is a bounded repository-infrastructure slice. Do not redesign Loom's test model or deployment flow.

## Goal

Stop relying on a developer manually running Loom's basic verification battery after every Codex PR.

The repository already defines the required baseline checks in `AGENTS.md`:

```text
npm test
npm run typecheck
git diff --check
```

Codex's execution environment has repeatedly been unable to install the Cloudflare/Vitest dependencies because of registry/network restrictions, even though the same test suite succeeds in a normal developer environment. GitHub Actions should become the independent repository-level place where this baseline battery runs automatically.

## Current relevant behavior

- There is currently no `.github/workflows` directory and no GitHub Actions CI workflow.
- `package.json` defines `npm test` as `vitest run` and `npm run typecheck` as `tsc --noEmit`.
- Loom currently targets Node 22 in the developer environment used for successful local runs.
- The repository does **not** track `package-lock.json`, so `npm ci` is not appropriate for this slice. Use `npm install`.
- `AGENTS.md` already requires `npm test`, `npm run typecheck`, and `git diff --check` before completion.
- Functional/browser smoke testing remains a separate requirement where applicable; this CI slice does not attempt to automate browser interaction.

## Required implementation

### 1. Add one minimal CI workflow

Create `.github/workflows/ci.yml`.

The workflow must:

- run for pull requests targeting `main`;
- run for pushes to `main`;
- use a single job on Ubuntu;
- check out the repository;
- install Node.js 22;
- run `npm install`;
- run `npm test`;
- run `npm run typecheck`;
- run `git diff --check`.

Keep the workflow deliberately boring and inspectable. Do not add a matrix, caching, artifacts, coverage upload, test sharding, or other CI machinery unless required for the three baseline checks to work.

### 2. Keep CI isolated from deployment and secrets

The workflow must **not**:

- deploy the Cloudflare Worker;
- run production D1 migrations;
- invoke `npm run deploy`, `db:migrate:production`, or equivalent;
- require Cloudflare API credentials;
- require Discord secrets;
- consume repository/environment secrets;
- write to production or external services;
- mutate repository contents.

Tests should run using the existing local/test facilities already used by `npm test`.

### 3. Keep repository instructions aligned

Update `AGENTS.md` narrowly so it states that pull requests are expected to pass the repository CI workflow containing the baseline battery.

Do not replace the existing instruction for agents to run checks locally when their environment permits it. CI is an independent verification layer, not an excuse to skip locally available checks.

If Codex's own environment is still unable to run npm-based checks because dependency installation is blocked, report that limitation normally; do not alter dependencies, registries, package versions, security settings, or the workflow to work around Codex's sandbox.

## Acceptance criteria

The slice is complete when:

1. `.github/workflows/ci.yml` exists and is valid GitHub Actions YAML.
2. It triggers on pull requests to `main` and pushes to `main`.
3. It uses Node 22.
4. It uses `npm install`, not `npm ci`, while the repository has no tracked lockfile.
5. It runs, as explicit steps, all three baseline checks:
   - `npm test`
   - `npm run typecheck`
   - `git diff --check`
6. It contains no deploy, production migration, credential, or secret-dependent behavior.
7. `AGENTS.md` accurately describes CI as an additional baseline verification layer while preserving the existing local-check requirement.
8. No unrelated application code, database migrations, dependency versions, or product behavior are changed.

## Required checks

Run where the environment permits:

```text
npm test
npm run typecheck
git diff --check
```

Also inspect the workflow file itself for valid YAML structure and confirm that no deployment or production commands are present.

If npm dependency installation is blocked by the Codex environment, do not repeatedly retry and do not change dependencies to compensate. Report the exact block and rely on the newly added GitHub Actions workflow plus a normal developer environment for execution verification.

## Documentation

No new durable architecture document under `docs/` is required for this slice. CI is repository infrastructure rather than a Loom product/lifecycle protocol.

Only update `AGENTS.md` as described above.

## Explicit non-goals

Do not implement or change:

- the planned GET/capability experiment;
- application behavior;
- compression behavior or tests beyond whatever is already on `main`;
- deployment automation;
- preview environments;
- Cloudflare authentication;
- production migrations;
- branch protection/rulesets;
- coverage thresholds or uploads;
- browser/E2E automation;
- dependency pinning or lockfile policy;
- package versions;
- test-suite refactors;
- unrelated documentation or cleanup.

Keep this slice small enough that, once merged, the next implementation task can move directly to the GET capability-chain experiment.