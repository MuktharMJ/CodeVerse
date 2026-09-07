# Deployment

CODEVERSE is a [Next.js 16](https://nextjs.org/) App Router application. The recommended production target is **Vercel**; the application also runs on any Node.js host that supports Next.js 16 with the same configuration. PostgreSQL is the persistent data tier and is required only for the persistent catalog and metadata snapshots — the application falls back to a bundled local catalog without it.

The repository already contains the configuration files needed for production deployment:

- `next.config.mjs` — production Next.js configuration plus the security header set.
- `vercel.json` — Vercel-specific deployment metadata; mirrors the same security headers on the edge layer.
- `.env.example` — the complete list of environment variables the application honors.

This document walks through the manual steps for a Vercel + external managed PostgreSQL deployment. No credentials are committed; no automatic deploy is performed.

## Prerequisites

1. A [Vercel](https://vercel.com/) account and a connected Git repository.
2. A managed PostgreSQL 16+ instance reachable from Vercel (Neon, Supabase, RDS, or a self-hosted instance with TLS).
3. Optional: a GitHub personal access token with `public_repo` scope for higher provider API limits.
4. Node.js 20.9 or newer installed locally for the build verification step.

## Step 1 — Provision the database

Create a PostgreSQL database for the persistent catalog. The application uses two tables (`technologies`, `relationships`) and one snapshot table (`snapshots`). Any modern PostgreSQL 14+ release is supported.

From your local machine:

```sh
# Set DATABASE_URL to the production database URI.
# For Neon/Supabase/RDS, the URI includes the pooler hostname, TLS, and credentials.
export DATABASE_URL="postgresql://user:password@host:5432/codeverse?sslmode=require"

npm install
npm run db:migrate
npm run db:seed
```

`db:migrate` applies both versioned SQL files transactionally; `db:seed` inserts the original 17 technologies and 29 relationships. Both commands are safe to re-run.

Verify the catalog is reachable from a server-side context. If your database host requires an IP allow-list, allow Vercel's outbound IP range or use a connection pooler.

## Step 2 — Deploy to Vercel

Import the repository in Vercel. The framework is auto-detected as Next.js. Vercel reads `vercel.json` for build/install commands and headers; both are already configured.

In the project settings:

- **Framework preset:** Next.js (auto-detected).
- **Build command:** `npm run build` (from `vercel.json`).
- **Install command:** `npm install` (from `vercel.json`).
- **Output directory:** leave blank (Next.js default).
- **Node version:** 20.x or 22.x (set in Project Settings → General → Node.js Version).

Click **Deploy**. The first build will fail because the environment variables below are not yet set; continue to Step 3.

## Step 3 — Configure environment variables

In **Project Settings → Environment Variables**, add the following for all environments (Production / Preview / Development as appropriate):

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Recommended | PostgreSQL connection URI with `sslmode=require` for managed providers. Leave unset to ship without the persistent catalog (the bundled local catalog will be used). |
| `GITHUB_TOKEN` | Optional | Server-only GitHub personal access token. Significantly raises the rate limit for the GitHub provider. Never prefix with `NEXT_PUBLIC_`. |

For local Vercel CLI testing, the same variables are read from your shell environment.

Click **Redeploy** after adding the variables.

## Step 4 — Verify the deployment

1. Open the production URL. The hero, search, and category filters must render within one second.
2. Select a technology with a curated npm source (for example, `React`). The dependency expansion panel must show the curated dependencies and the dashed gold lines must appear on the canvas when toggled.
3. Open the developer tools **Network** tab and verify:
   - `GET /api/catalog` returns the full database catalog with `origin: "database"`.
   - `GET /api/technologies/react` returns GitHub and npm results within five seconds.
   - Response headers include `x-content-type-options: nosniff`, `x-frame-options: DENY`, `referrer-policy: strict-origin-when-cross-origin`, and `permissions-policy: camera=(), microphone=(), geolocation=(), interest-cohort=()`.
4. Check that `https://<your-domain>/icon` returns a 200 with `content-type: image/png`.
5. Visit `https://<your-domain>/?technology=react` directly — the inspector must open without a fresh load.

## Step 5 — Optional production hardening

The defaults in `vercel.json` and `next.config.mjs` are intentionally quiet. For additional hardening, configure the following in Vercel or your CDN:

- **Custom domain:** bring a managed domain and add it in **Project Settings → Domains**. Vercel provisions TLS automatically.
- **Rate limiting:** Vercel's Edge Middleware can rate-limit `GET /api/*` if abuse appears; the application does not do this by default to keep the architecture small.
- **Observability:** enable Vercel Web Analytics or attach your APM. The route handlers log via the framework's standard mechanisms; no application-level instrumentation is required.

## Step 6 — Maintenance

### Migrations

Add new SQL files to `migrations/` using a four-digit version prefix (for example, `0003_my_change.sql`). The runner applies new migrations transactionally; it refuses out-of-order or changed-content migrations, so always append, never edit an applied file.

```sh
npm run db:migrate   # safe to re-run
```

### Backing up the catalog

The catalog is durable PostgreSQL data. Use your database host's standard backup mechanism (Neon branches, Supabase backups, RDS snapshots, or `pg_dump` for self-hosted). The snapshot table holds the latest successful GitHub/npm payload per source, used for resilience against provider outages; treat it as a cache, not a primary data source.

### Updating the catalog content

To change a technology's name, description, position, or source mappings, edit the row in `public.technologies` directly. Re-running `npm run db:seed` will not overwrite your changes (it uses `ON CONFLICT DO NOTHING`). The seeded JSON in `src/data/local-catalog.ts` is the initial seed only; the database is the live source of truth after the first seed.

### Disabling the persistent tier

To run a deployment without the database entirely, omit `DATABASE_URL`. The application will use the bundled local catalog (`src/data/local-catalog.ts`) for every request and report `origin: "local"` in the topbar. External metadata requests continue to function; durable snapshots simply have nowhere to persist.

## Rollback

CODEVERSE has no destructive migrations and no automatic schema changes. To roll back a deployment:

1. Revert the deployment in Vercel's **Deployments** view.
2. If a migration was applied, write a compensating migration in `migrations/` (the runner never edits applied files).
3. Snapshots written during the failed window remain valid for their `fetchedAt`; no cleanup is needed.

## What this document does not do

- It does **not** purchase a domain on your behalf.
- It does **not** provision a managed PostgreSQL instance.
- It does **not** create a Vercel account or trigger a deployment.
- It does **not** rotate or store credentials.

All of those steps require your credentials and explicit account actions.