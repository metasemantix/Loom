# Loom

Loom is a deliberately small Cloudflare Worker and D1 application for
participant-owned text documents. This vertical slice includes Discord sign-in,
browser sessions, document revision history, and stable authorized Markdown and
JSON projections. It does **not** include agent credentials, experiments,
handshakes, or backend AI.

## Local development

1. Create a Discord application and add
   `http://localhost:8787/auth/discord/callback` as an OAuth redirect URI.
2. Copy `.dev.vars.example` to `.dev.vars` and supply the application ID and
   secret.
3. Install dependencies with `npm install`.
4. Create the local database with
   `npm exec wrangler d1 migrations apply loom --local`.
5. Start the Worker with `npm run dev`, then open `http://localhost:8787/login`.

Run `npm test` for authorization and ownership integration tests, and
`npm run typecheck` for static checks.

## Deployment

Create a D1 database, replace `database_id` in `wrangler.jsonc`, set the
`DISCORD_CLIENT_ID` and `DISCORD_REDIRECT_URI` variables for the deployed URL,
and store `DISCORD_CLIENT_SECRET` with `wrangler secret put`. Apply migrations
before deploying:

```sh
npm exec wrangler d1 migrations apply loom --remote
npm run deploy
```

Participant context has stable projections at
`/participants/{participant_id}/context.md` and
`/participants/{participant_id}/context.json`. Anonymous callers see public
documents only; the owning participant's session additionally reveals private
documents. All writes resolve ownership from the server-side session rather
than a participant identifier supplied by the browser.
