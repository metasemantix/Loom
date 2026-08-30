# Loom

Loom is a deliberately small Cloudflare Worker and D1 application for
participant-owned text documents. It includes Discord sign-in, Loom-native
participant profiles, browser sessions, uploads, document and metadata history,
stable authorized Markdown/JSON projections, and projects that reference (but
do not copy) participant-owned documents. It does **not** include agent
credentials, direct messaging, semantic search, or backend AI.

See [`CHANGELOG.md`](./CHANGELOG.md) for notable application and interface
changes.

## Local development

### Fresh machine setup

1. Install Git and the current Node.js LTS release. Node.js includes `npm`.
2. Clone the repository and enter it:

   ```sh
   git clone https://github.com/metasemantix/Loom.git
   cd Loom
   ```

3. Install dependencies with `npm install`.
4. Choose a local authentication setup:
   - For zero-setup, single-user development, uncomment `DEV_AUTH_BYPASS=1` in
     `.dev.vars`. Loom creates and reuses one deterministic local participant,
     establishes ordinary database-backed sessions, and continues to enforce all
     normal authorization rules. The bypass only activates on localhost/loopback;
     setting the variable on a deployed hostname has no effect. Active pages show
     a conspicuous `DEV AUTH` badge.
   - To exercise Discord OAuth, create a Discord application and add
     `http://localhost:8787/auth/discord/callback` as an OAuth redirect URI.
5. Copy `.dev.vars.example` to `.dev.vars` and enable the selected option. Supply
   the Discord application ID and secret only when using OAuth. `.dev.vars` is
   local-only and is deliberately not supplied by Git. Never enable the bypass as
   a substitute for production authentication.
6. Create/update the local D1 database by applying all migrations:

   ```sh
   npm exec wrangler d1 migrations apply loom --local
   ```

7. Start the Worker with `npm run dev`, then open `http://localhost:8787/`. Dev
   auth enters Loom automatically; otherwise Loom presents the Discord sign-in.

On Windows PowerShell, an execution policy may block `npm.ps1` even when Node.js
is installed correctly. In that case use `npm.cmd` / `npx.cmd`, or run the npm
commands from Command Prompt, rather than changing the machine's execution
policy just for Loom.

When returning to an existing clone, pull the latest code, run `npm install` if
dependencies changed, and re-apply local migrations before starting Loom.

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

## Product surfaces and API

Signed-in participants manage their corpus at `/me`, their Loom identity at
`/control-room`, and shared reference spaces at `/projects`. Compact collection
views open full content through the authorized `/documents/{document_id}` reader.
Document creation,
upload, content revisions, metadata changes, history, and deletion are exposed
under `/api/me/documents`. Upload accepts faithful `.md`, `.txt`, and `.json`
sources up to 256,000 bytes; JSON is validated and source filename/type metadata
is retained.

`PUT /api/me/documents/{id}/metadata` changes title, logical path, or public /
private visibility without creating a content revision. Such changes are
explicit metadata events returned alongside content revisions by
`GET /api/me/documents/{id}/versions`. Logical paths are organizational only
and must be unique within a participant's corpus.

Projects are available under `/api/projects`. Projects have a plain-text
description and owner/admin/member roles. Seven-day, single-use invitation URLs
use hashed bearer tokens and require an explicit accept or decline; creating or
previewing an invitation never creates membership. A project stores memberships and
references to source documents; the human UI offers only the signed-in participant's
eligible documents in a title/path picker. References use database foreign keys with
cascade deletion, so removing a link never deletes its source while deleting a
source cannot leave a hidden copy. `members_and_agents` exposes linked content
in authenticated member project views. `agents_only` suppresses linked content
from human project views while retaining the policy and references for a future
authorized-agent layer. Neither mode grants members write or delete authority
over another participant's source document. All mutation routes require an
authenticated session and a matching `Origin` header.

Owners can appoint administrators and deliberately transfer ownership to an
existing member, remaining an administrator afterward. Members and
administrators can leave; administrators can remove ordinary members, while
only owners can remove administrators. Departure removes only the departing
participant's project links and never their source documents.
