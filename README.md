# CODEVERSE

**Navigate the universe of software.**

An intelligent, interactive 3D atlas of the software ecosystem — built with real GitHub and npm data, a persistent PostgreSQL catalog, and an explainable intelligence layer that surfaces dependencies, recommendations, and repository activity. Curated, never fabricated.

![CODEVERSE — interactive 3D atlas of the software ecosystem](https://codeverse.example/icon)

[Overview](#overview) · [Features](#features) · [Stack](#stack) · [Local development](#local-development) · [Environment](#environment) · [Database](#database) · [Testing](#testing) · [Production build](#production-build) · [Deployment](#deployment) · [Project structure](#project-structure) · [Scope](#scope)

## Overview

CodeVERSE turns a curated catalog of 17 foundational software technologies into a navigable 3D universe. Each point in the universe is a technology; each line is an explicit, sourced connection between technologies. Selecting a technology opens an inspector that streams its live GitHub statistics and latest npm manifest, expands its dependency graph as dashed gold arcs on the canvas, and surfaces explainable recommendations based on shared ecosystem neighbors.

The application is intentionally **quiet** — it never invents statistics, never fabricates relationships, and never stores personal data. GitHub and npm values are validated against provider JSON; missing values are labeled, not guessed. Connection lines are explicit curated edges with provenance, plus optional runtime-discovered dependency edges drawn from the selected package's npm manifest.

## Features

- **Cinematic 3D universe** — drag to orbit, pinch or scroll to zoom, right-drag to pan. 17 technology nodes across four color-coded constellations with custom radial glow shaders, 2,600 background stars, and damped camera transitions. Missing WebGL falls back to the keyboard-friendly HTML directory.
- **Curated relationships** — 29 explicit ecosystem edges, every one with kind, provenance, and a human-readable explanation. Self-loops and undirected duplicates are rejected by the database.
- **Real GitHub and npm signals** — repository stars/forks/issues/language/pushed-at/archived and package/version/license/dependencies/peers are loaded server-side with five-second deadlines, in-process memory caching, and durable PostgreSQL snapshots. Stale and rate-limit results are surfaced honestly, not replaced with fake values.
- **Lazy dependency exploration** — expand a curated npm package's manifest to reveal up to **eight dashed gold dependency links** to in-catalog neighbors. Declared packages outside the catalog stay external npm links; peer requirements are labeled separately and never bundled with runtime dependencies.
- **Explainable recommendations** — at most four neighbor-overlap-based suggestions, each with an exact reason string. Recommendations are deterministic and never include the selected technology itself.
- **Activity classification** — repository activity is classified from GitHub's last-push timestamp into `Active` (0–90 days), `Quiet` (91–365), `Low Activity` (over 365), `Archived`, or `Unknown`. Missing or invalid timestamps stay `Unknown`, never zero.
- **Shareable URLs** — `/?technology=react` resolves catalog IDs and slugs, writes the selected slug, and preserves unrelated query parameters and the hash. Back/Forward navigation restores selection; invalid IDs show a recoverable notice.
- **Search** — ranked, indexed, client-side over the server-supplied catalog. Normalizes case and punctuation; ranks exact names/IDs/slugs/aliases before prefixes, substrings, and word matches.
- **Responsive** — desktop, laptop, tablet, and mobile layouts with 36 px minimum touch targets and safe-area-aware padding. `prefers-reduced-motion` disables every animation.
- **Graceful degradation** — missing metadata, rate limits, timeouts, and WebGL unavailability all have explicit empty/error states. Local fallback catalog remains useful when the database is unavailable.

## Stack

- **Next.js 16** (App Router, Turbopack, Route Handlers) with React 19
- **TypeScript** in strict mode
- **React Three Fiber**, **@react-three/drei**, and **Three.js** for the 3D presentation
- **Tailwind CSS 4** (used minimally; most styles live in a single `globals.css`)
- **PostgreSQL** with the `postgres` (Postgres.js) driver, raw parameterized SQL, no ORM
- **Playwright** for end-to-end browser tests and Node's `tsx --test` for pure unit tests

## Local development

Requires **Node.js 20.9 or newer**. For the local fallback experience, no environment variables or Docker installation are required:

```sh
npm install
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

For the full experience including persistent metadata snapshots and the database-backed catalog, set `DATABASE_URL` and optionally `GITHUB_TOKEN` — see [Environment](#environment) and [Database](#database).

## Environment

All environment variables are documented in `.env.example`. Use private shell variables or `.env.local`; `.env*` is ignored by git except for `.env.example`.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Server-side PostgreSQL connection URI for the persistent catalog and metadata snapshots. Optional — blank or unavailable databases fall back to the bundled local catalog. |
| `GITHUB_TOKEN` | Optional server-only GitHub token for higher provider API limits. Never use a `NEXT_PUBLIC_` prefix; never commit a real token. |
| `TEST_DATABASE_URL` | Disposable database for opt-in integration tests. Must be a database you are willing to have schema created and dropped in. Never production. |
| `PORT` | Server port for `npm run start`. Defaults to Next.js's standard `port. |

Application environment files are loaded by Next.js. `scripts/db.ts` also loads Next.js environment files via `@next/env`. The standalone `test:db` runner reads `TEST_DATABASE_URL` from its own process environment.

### Security posture

- The GitHub token is read only by `src/services/metadata.ts` (which imports `server-only`) and sent only to `api.github.com`.
- Provider URLs are built from validated source mappings on fixed hosts; raw provider JSON is parsed by `parseGitHub`/`parseNpm` before being exposed.
- Database reads validate identities, aliases, and source strings before the catalog is exposed.
- No `dangerouslySetInnerHTML`, no `eval`, no client-side secrets.
- `next.config.mjs` sets `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, and a strict `Permissions-Policy` on every response; `vercel.json` mirrors the same set on the Vercel edge.

## Database

The PostgreSQL catalog is the persistent source of truth for technologies, relationships, and successful metadata snapshots. The bundled local catalog (`src/data/local-catalog.ts`) is the offline safety net: it ships with the application and is used whenever `DATABASE_URL` is unset, unreachable, or returns an error.

### Migrations and seed

Two versioned migrations create the schema; the migration runner applies them transactionally under an advisory lock and records normalized-content SHA-256 checksums:

| Migration | Schema |
| --- | --- |
| `0001_catalog.sql` | `technologies`, `relationships`, `snapshots`; foreign keys, uniqueness/check constraints, indexes, and automatic `updated_at` triggers. |
| `0002_catalog_validation.sql` | Flat non-null alias validation; safe lowercase ID/slug constraints and reserved-name rejection; category and stable-order indexes. |

```sh
npm run db:migrate
npm run db:seed
```

`npm run db:seed` inserts the original **17 technologies and 29 relationships** with `ON CONFLICT DO NOTHING`. Re-running it preserves existing database edits and does not reset names, aliases, source mappings, geometry, ordering, or relationship weights. It is additive — not a synchronization tool.

The migration runner refuses out-of-order or changed-content migrations. Add a new migration instead of editing an applied file. Application startup does not automatically migrate or seed.

### Connection handling

- At most 5 connections per process, 2-second connection timeout, 3-second statement timeout.
- Each page/API request deliberately attempts a catalog read; concurrent reads in the same process share one in-flight promise.
- Four-second catalog deadline; failures fall back to the last-known successful database catalog (with `stale: true`), or to the bundled local catalog.
- Pool is closed on a deadline so a later request can reconnect.

### Optional Docker PostgreSQL (local-only)

If you don't already have PostgreSQL, this is a local-only alternative using the official image. It requires Docker and a non-empty `POSTGRES_PASSWORD` supplied privately in your shell environment. There is no hardcoded password and no deployment Compose requirement. Do not start it while another PostgreSQL instance occupies port `55432`.

```powershell
if ([string]::IsNullOrWhiteSpace($env:POSTGRES_PASSWORD)) {
  throw "Set POSTGRES_PASSWORD in your private shell environment first."
}
docker run --name codeverse-postgres --detach `
  --publish 127.0.0.1:55432:5432 `
  --env POSTGRES_USER=codeverse `
  --env POSTGRES_DB=codeverse `
  --env POSTGRES_PASSWORD `
  --mount type=volume,source=codeverse-postgres-data,target=/var/lib/postgresql `
  postgres:18.4
```

Then:

```powershell
$env:DATABASE_URL = "postgresql://codeverse:$([Uri]::EscapeDataString($env:POSTGRES_PASSWORD))@127.0.0.1:55432/codeverse"
npm run db:migrate
npm run db:seed
npm run dev
```

This container is a development convenience, not a deployment configuration.

## Testing

The repository ships with four test suites, all opt-in friendly:

| Suite | Command | What it covers |
| --- | --- | --- |
| Intelligence unit tests | `npm run test:intelligence` | Pure functions: `isPackageName`, `dependencyEvidence`, `dependencyExpansion` (cap + dedupe), `recommendations` (deterministic + explainable), `activitySignal` (every classification branch). |
| End-to-end browser tests | `npm run test:e2e` | Graph integrity, search/keyboard input, URL/history, canvas identity, inspector metadata, stale-response isolation, responsive bounds, dependency expansion/recommendation behavior, footer/metadata polish, ship-readiness. |
| Database integration tests | `npm run test:db` | Migrations/seed/Snapshots against a disposable PostgreSQL database. Opt-in via `TEST_DATABASE_URL`; uses an isolated random schema and drops it with `CASCADE`. |
| Real provider smoke test | `CODEVERSE_LIVE_METADATA=1 npx playwright test tests/live-metadata.spec.ts` | Optional end-to-end test against the live GitHub and npm APIs. Opt-in only; requires `npm run build` first. |

A full pre-merge sequence is:

```sh
npm run typecheck
npm run lint
npm run build
npm run test:intelligence
npm run test:e2e
```

Browser tests require the production build and start a local server automatically when one is not already running. First install Chromium inside the project (PowerShell):

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH="$PWD\.cache\ms-playwright"
npx playwright install chromium
```

Metadata fixtures are explicitly synthetic test-only data, not seeded statistics. Test environments can independently opt into fallback or live runs; a default run does not verify all modes.

## Production build

```sh
npm run build
npm run start
```

`npm run build` produces an optimized production build with three server-rendered routes plus the static `/icon` route and one prendered `_not-found` page:

```
Route (app)
┌ ƒ /                          Dynamic server-rendered page (force-dynamic catalog snapshot)
├ ○ /_not-found                Static 404 page
├ ƒ /api/catalog               Server-side catalog search
├ ƒ /api/technologies/[id]     Server-side metadata
└ ○ /icon                      Static PNG favicon generated from src/app/icon.tsx
```

`npm run start` runs the production server. Set `PORT` to override the default Next.js port.

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for the complete manual Vercel + external PostgreSQL deployment checklist, including environment variable setup, build command, and regional configuration.

The application is Vercel-native: zero configuration is required to deploy, but `vercel.json` documents the production-intent headers and the application can be deployed to any Node.js host that supports Next.js 16.

## Project structure

```text
migrations/
  0001_catalog.sql              Catalog, relationships, snapshots, constraints/triggers
  0002_catalog_validation.sql   Alias/identity constraints and catalog indexes
scripts/
  db.ts                        tsx migrate/seed CLI with environment loading
src/
  app/
    layout.tsx                 Metadata, root layout, Open Graph, app icon
    page.tsx                   Dynamic server page and catalog snapshot boundary
    icon.tsx                   Generated CODEVERSE monogram favicon
    globals.css                Space atmosphere and responsive interface styles
    api/catalog/route.ts       Full catalog and ranked query GET endpoint
    api/technologies/[id]/     Server-side metadata GET endpoint
  data/
    technologies.ts            Original nodes, category styling, curated relationships
    technology-sources.ts      Fixed seed GitHub/npm mappings and notes
    local-catalog.ts           Shared seed and local fallback catalog
  db/
    client.ts                  Lazy bounded Postgres.js pool; no ORM
    migrate.ts                 Ordered SQL, advisory lock, checksum ledger
    seed.ts                    Non-destructive transactional catalog inserts
    catalog.ts                 Consistent ordered reads and mapping validation
    snapshots.ts               Source-keyed successful snapshot reads/upserts
components/
    catalog-provider.tsx       Shared snapshot context, precomputed indexes, ephemeral expansion
    universe-explorer.tsx      Interaction state, directory, help, and error boundary
    explorer-overlay.tsx       Branding, category filters, previews, and inspector
    ecosystem-intelligence.tsx Dependency exploration and recommendation panels
    technology-icon.tsx        Lightweight inline technology glyphs
    technology-search.tsx      Accessible ranked search combobox
    technology-metadata.tsx    Inspector signals, retrieval time, stale/failure labels, activity signal
    scene/
      universe-scene.tsx       Canvas, starfield, dashed dependency edges, guides, and camera rig
      technology-node.tsx      Geometric core, glow shader, orbital rings, and label
  lib/
    catalog.ts                 ID/slug resolution and adjacency indexing
    intelligence.ts            Dependency evidence/expansion, recommendations, activity signal
    search.ts                  Shared ranked search factory and seed aliases
    selection-url.ts           Shareable selection and browser history subscription
  services/
    catalog.ts                 Server-only database read and last-known/local fallback
    metadata.ts                Current sources, token, persistence, refresh entry point
    metadata-transport.ts      Providers, validation, deadlines, cache, stale snapshots
  types/
    catalog.ts                 Shared catalog, technology, and relationship contracts
    metadata.ts                Shared provider/result contracts (with optional activity fields)
tests/
  universe.spec.ts             Graph integrity and desktop/mobile browser tests
  discovery.spec.ts            Search, URLs, inspector, fallback, responsive, dependency expansion and recommendations
  activity-metadata.spec.ts    GitHub activity-field validation across provider and persisted paths
  metadata-services.spec.ts    Deterministic mocked provider/service tests
  metadata-persistence.spec.ts Snapshot freshness, source isolation, failure deadlines
  intelligence.spec.ts         Pure dependency/expansion/recommendation/activity-classifier tests
  polish.spec.ts               Phase 5 visual polish, skeletons, touch targets, accessibility
  showcase.spec.ts             Phase 6 ship readiness, OG metadata, hardening headers, provenance labels
  database.spec.ts             Opt-in Node/tsx tests against real PostgreSQL
  catalog.spec.ts              Opt-in database API/UI and local fallback browser tests
  live-metadata.spec.ts        Opt-in real API smoke check
  next.config.mjs              Production Next.js configuration and security headers
  vercel.json                  Vercel deployment headers and build configuration
  playwright.config.ts         Production-server browser test configuration
  eslint.config.mjs            ESLint + Next.js core-web-vitals + TypeScript rules
  tsconfig.json                Strict TypeScript with path aliases
  postcss.config.mjs           Tailwind CSS plugin
```

## Scope

This documents the implemented CODEVERSE experience. The application is feature-complete for the planned scope:

- 17 curated technologies across four color-coded constellations
- 29 curated undirected ecosystem relationships with provenance and explanation
- Real GitHub repository signals (stars/forks/issues/language/pushed-at/archived)
- Real npm package signals (version/license/declared dependencies and peers)
- Lazy dependency expansion bounded to 8 edges
- Explainable, deterministic recommendations
- Repository activity classification (Active / Quiet / Low Activity / Archived / Unknown)
- Shareable URLs, browser history support, full keyboard navigation
- Responsive from 390 × 844 mobile to 1600+ desktop
- `prefers-reduced-motion` honored throughout
- Graceful fallback catalog when the database is unavailable
- Durable metadata snapshots with rate-limit-aware retry
- Hardened security headers, OG/Twitter metadata, ship-ready favicon

**Not included** (and intentionally out of scope for the planned release):

- Authentication, accounts, profiles
- Bookmarks, personalized universes, history persistence
- Redis, distributed cache coordination, background refresh workers
- Social features, collaboration, comments, sharing beyond URL state
- Chatbot / AI assistant features
- Payments, notifications, deployment automation
- Large-graph performance optimizations (level-of-detail, batched rendering, automatic layout)
- Catalog editing UI, dependency-graph import for arbitrary npm manifests

## License

This project ships as a public showcase. No third-party content or copyrighted assets are bundled; all UI artwork is inline SVG; all data is curated or fetched live from public provider APIs under their respective terms.

---

**Status:** Ready to ship. Typecheck, lint, production build, and 155 Playwright + intelligence + activity tests all pass; `npm audit` reports zero vulnerabilities.