# Current Codex Task

Implement the current bounded Loom slice: **production deployment readiness without local configuration juggling**.

Read and follow `AGENTS.md`. Inspect the current `wrangler.jsonc`, `README.md`, package scripts, authentication configuration, and D1 migration workflow before changing code. Preserve existing application behavior and the current local-development auth option.

## Goal

Prepare Loom for a clean first real deployment to Cloudflare using a **fresh production D1 database**, without depending on the developer manually editing tracked configuration back and forth between localhost and production values.

The existing local D1 database is disposable and does not need to be migrated, copied, or preserved for production.

## Required behavior

- Separate local-development configuration from production deployment configuration cleanly using Wrangler-supported environment/configuration mechanisms.
- Keep local development straightforward: localhost Discord callback and optional `DEV_AUTH_BYPASS=1` must continue to work without requiring production credentials or a production database.
- Production deployment must use its own D1 binding/database ID and deployed Discord redirect URI without requiring edits to tracked files before or after each deployment.
- Do not place real Discord credentials, Cloudflare tokens, or other secrets in tracked files.
- Treat `DISCORD_CLIENT_SECRET` as a production secret. If `DISCORD_CLIENT_ID` is not sensitive, it may be ordinary environment configuration; use the simplest clear arrangement consistent with Wrangler conventions.
- Keep `DEV_AUTH_BYPASS` off in production configuration by default. Do not make agent access depend on dev auth.
- Add or adjust package scripts if useful so the intended local and production workflows are explicit and hard to confuse, for example local migration/start versus remote migration/deploy. Do not add unnecessary tooling.
- Production deployment should assume a brand-new empty D1 database and apply the repository's full migration history to it.
- Preserve the fixed three-day lifecycle policy. Do not accidentally turn deployment configuration into a new source of variable product policy.
- Update `README.md` with a concise first-deployment runbook that clearly distinguishes:
  - one-time Cloudflare authentication/setup;
  - creation of a fresh production D1 database;
  - where the returned database ID belongs;
  - production Discord OAuth callback configuration;
  - secret/configuration setup;
  - applying migrations to the remote database;
  - deploying;
  - a smallest meaningful post-deploy smoke check.
- The runbook must make clear which values are safe configuration and which are secrets, and must not ask the developer to paste secrets into source files.
- Keep Codespaces usable as the deployment console. Do not require Codespaces-specific secrets unless Wrangler/Cloudflare genuinely needs them; prefer one-time interactive authentication or documented Cloudflare-supported credential setup.

## Validation and safety

- Verify local development configuration still works structurally and that production configuration does not inherit or accidentally enable dev auth.
- Verify the production D1 binding/configuration path is distinct from the local D1 state.
- Validate Wrangler configuration using the existing toolchain where possible.
- Run the complete validation required by `AGENTS.md`.
- If an actual Cloudflare account/database/deployment is required for a validation step and credentials are unavailable in the Codex environment, do not invent values or weaken configuration. Validate everything possible offline and report the remaining one-time operator steps explicitly.

## Scope boundaries

Do not implement agent authentication or an agent API in this slice. Do not migrate the developer's existing local database. Do not add CI/CD, custom domains, notifications, or unrelated infrastructure unless a tiny change is strictly required for a safe first deployment.

At completion, report what changed, the resulting local-vs-production configuration model, any scripts/documentation added, validation results, and the exact remaining one-time console actions required for the first real deployment.
