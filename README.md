# CODEVERSE

**Navigate the universe of software.**

A Phase 4 software discovery experience: an intelligent, interactive 3D atlas backed by a persistent PostgreSQL catalog, real GitHub/npm metadata with provenance, lazy dependency exploration, deterministic explainable recommendations, and live repository activity classification. Built with Next.js App Router, TypeScript, React Three Fiber, Three.js, Drei, and Tailwind CSS.

Database access uses raw, parameterized SQL through the `postgres` (Postgres.js) driver, not an ORM. The `tsx` CLI runs TypeScript migration, seed, and database-test entry points. PostgreSQL enables persistence but is optional for exploration: the bundled curated universe and browser search remain available without a database or external metadata providers.

## Run locally

Requires Node.js 20.9 or newer. For the local fallback experience, no environment variables or Docker installation are required:

```sh
npm install
npm run dev
```

Open http://127.0.0.1:3000.

### Environment

Use private shell environment variables or an ignored `.env.local`, following the names in `.env.example`. Never commit real credentials or use a `NEXT_PUBLIC_` prefix for any of these values.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Required for persistent catalog/snapshot access and `db:migrate` / `db:seed`. Optional for running the app; blank, unavailable, empty, or invalid database catalogs fall back as described below. |
| `GITHUB_TOKEN` | Optional server-only GitHub token for higher provider API limits. No token is needed for catalog access, npm, or fresh stored snapshots. |
| `TEST_DATABASE_URL` | Opt-in database tests only. Must identify a disposable test database, never production or a database containing valuable data. Export it in the test runner's environment. |

Next.js loads application environment files. `scripts/db.ts` also loads Next.js environment files with `@next/env` before running commands, then closes the database pool. The standalone `test:db` runner reads `TEST_DATABASE_URL` from its process environment; it does not load `.env.local` itself or fall back to `DATABASE_URL`.

### Existing PostgreSQL

Use an existing PostgreSQL server if available; Docker is not required. Set `DATABASE_URL` to its connection URI, with your own database/user/password and any required TLS options. Percent-encode reserved characters in URI credentials. Create the database beforehand and use a role allowed to create its tables, functions, triggers, and indexes.

```sh
npm run db:migrate
npm run db:seed
npm run dev
```

Local database verification used a real native/embedded **PostgreSQL 18.4** instance on `127.0.0.1:55432`, not a mock or an in-browser SQL substitute. The PostgreSQL installation, binaries, and database data are not committed. This is a verified local setup, not an application-managed database installer or a claim that every PostgreSQL version has been tested.

### Optional Docker PostgreSQL

If you do not already have PostgreSQL, this is a local-only alternative using the official image. It requires Docker and a nonempty `POSTGRES_PASSWORD` supplied privately in your shell environment. There is no hardcoded password or deployment Compose requirement. Do not start it while another PostgreSQL instance occupies port `55432`.

PowerShell:

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

Docker creates the named volume `codeverse-postgres-data` automatically. PostgreSQL 18's image uses a versioned data directory under `/var/lib/postgresql`, so the volume mounts that parent. The port binds only to IPv4 loopback, not all host interfaces. Initialization variables apply only to a new, empty volume; changing the environment later does not reset an existing database password.

Wait until this readiness check reports that PostgreSQL is accepting connections:

```powershell
docker exec codeverse-postgres pg_isready -U codeverse -d codeverse
```

Then construct the application URI without printing or embedding the password, and initialize the catalog:

```powershell
$env:DATABASE_URL = "postgresql://codeverse:$([Uri]::EscapeDataString($env:POSTGRES_PASSWORD))@127.0.0.1:55432/codeverse"
npm run db:migrate
npm run db:seed
npm run dev
```

Use `docker stop codeverse-postgres` and `docker start codeverse-postgres` for subsequent sessions. The named volume retains data across container replacement; do not remove it unless you intend to erase that database. This container command is a development convenience, not a deployment configuration.

## Architecture

```text
Browser requests /
  -> Next.js dynamic server page
     -> server-only getCatalog() -> raw SQL -> PostgreSQL catalog
                                -> on failure: last-known catalog / bundled catalog
     -> serialized Catalog snapshot -> CatalogProvider
        -> indexed IDs, slugs, neighbors, and ranked search
        -> ephemeral dependency expansion (bounded to 8 npm edges)
        -> 3D scene, directory, filters, inspector, selection URL
        -> keystrokes search this snapshot locally (no SQL or HTTP per keystroke)

GET /api/catalog[?q=...]
  -> same getCatalog() -> full catalog or same ranked search on the server

Inspector -> GET /api/technologies/[id]
  -> server-only metadata service -> current catalog's fixed source mappings
     -> per-provider memory cache / PostgreSQL successful snapshots
     -> GitHub + npm in parallel when refresh is needed
     -> normalized results, or explicit last-good / failure states

Intelligence: dependency evidence, recommendations, activity signal
  -> pure functions over the catalog + npm result; never fabricate
  -> expansion is client-side state, reset on Back/Forward, never persisted

tsx scripts/db.ts -> migrations/*.sql / bundled seed -> PostgreSQL
```

### Catalog and search

`src/app/page.tsx` is `force-dynamic`: it loads a server catalog snapshot and passes it to `CatalogProvider`. Database reads use a repeatable-read, read-only transaction so technologies and relationships come from a consistent view, ordered by `"order"` and then ID. The provider builds ID, slug, neighbor, connection, and search indexes for that snapshot; scene counts, directory entries, descriptions, source mappings, and relationship explanations all use it.

Each page/API request deliberately attempts a catalog read; concurrent reads in the same server process share one in-flight promise. There is a **four-second catalog deadline**, with earlier fallback on errors. The database pool has at most five connections, a two-second connection timeout, and a three-second statement timeout. On a catalog deadline the pool is closed so a later request can reconnect.

If a read fails, the service returns the last successfully read database catalog from that process with `stale: true`. If none exists, it returns the bundled local catalog. The UI explicitly labels these states `CONNECTED`, `CACHED`, or `LOCAL`, with explanatory titles. Last-known catalog retention is process-local, not durable storage; restarting an unavailable server loses that in-memory copy. Database recovery is checked on subsequent requests, not through polling. An already open page continues using its supplied snapshot until it is loaded again.

Search is **indexed client-side search over the server-supplied catalog, not SQL per keystroke**. The shared `createTechnologySearch` normalizes case and punctuation and ranks exact names/IDs/slugs/aliases before prefixes, substrings, then all-word matches across names and descriptive/category text. Equal scores preserve catalog order. Blank queries return the catalog in order; unmatched queries return no results.

| Endpoint | Implemented behavior |
| --- | --- |
| `GET /api/catalog` | Full `{ origin, technologies, relationships, stale? }` catalog, including fallback state. |
| `GET /api/catalog?q=postgres` | `{ origin, technologies }` ranked results using the same search implementation, backed by the database catalog when available. `q` is limited to 200 characters. This response does not include relationships or the catalog's `stale` flag. |
| `GET /api/technologies/[id]` | Accepts a current catalog ID or slug and returns the canonical `technologyId` plus independent GitHub/npm results. Unknown IDs return 404; unexpected service failures return a sanitized 503. |

Both catalog response forms use `Cache-Control: no-store`. The browser search UI does not call the search endpoint. Metadata responses are publicly cacheable for 60 seconds only when both providers are successful and non-stale; partial, unconfigured, or stale results use `no-store`.

### Schema and seed

There are two versioned SQL migrations, plus the migration runner's `schema_migrations` ledger:

| Migration | Schema |
| --- | --- |
| `0001_catalog.sql` | `technologies`, `relationships`, and `snapshots`; foreign keys, uniqueness/check constraints, indexes, and automatic `updated_at` triggers. |
| `0002_catalog_validation.sql` | Flat, non-null alias validation; safe lowercase ID/slug constraints and reserved-name rejection; category and stable-order indexes. |

- `technologies` stores ID, unique slug, category, name, description/detail, aliases, symbol, fixed 3D position, size, ordering, source mappings/notes in JSONB, and timestamps. Category styling stays in application code. Geometry is stored, not regenerated by a layout algorithm: positions must contain three finite coordinates and size must be positive and finite.
- `relationships` stores ID, source/target foreign keys, kind, provenance, direction, optional weight/explanation, ordering, and timestamps. Self-links are forbidden; undirected duplicates are rejected regardless of endpoint order, while directed uniqueness respects endpoint order. Optional weights are constrained to `[0, 1]`.
- `snapshots` stores normalized successful provider payloads as JSONB, `fetched_at`, and timestamps. Uniqueness is `(technology_id, provider, source_key)`, where the source key is the exact GitHub repository or npm package mapping. Upserts replace only an older success, preventing a late response from overwriting newer data. This is the latest success per source, not a historical time series.

The migration runner applies ordered files transactionally under an advisory lock and records normalized-content SHA-256 checksums. Re-running `npm run db:migrate` is safe; missing/changed applied migrations or out-of-order additions are rejected. Add a new migration instead of editing an applied file. Application startup does not automatically migrate or seed.

`npm run db:seed` transactionally inserts the original **17 technologies and 29 relationships** using `ON CONFLICT DO NOTHING`. Re-running it preserves existing database edits and does not reset names, aliases, sources, geometry, ordering, relationship weights, or explanations. It is an additive seed, not a synchronization/reset tool: missing seed rows can be reinserted. It neither contacts providers nor fabricates metadata snapshots.

The bundled catalog remains both seed input and the offline safety net. GitHub repository identifiers, npm package names, and explanatory source notes are explicitly curated and stored with each technology, rather than guessed from its display name. Database reads validate identities, aliases, and source strings before the catalog is exposed; provider URLs are built only from validated mappings on fixed hosts.

### Metadata persistence

GitHub's repository API supplies repository name, stars, forks, open issues (including pull requests), language, last-push timestamp, archived flag, and URL. npm's latest-version endpoint supplies package/version/license and declared dependency/peer-dependency maps. These are validated provider values, not hardcoded statistics; missing values are labeled rather than estimated. Hugging Face maps to its representative Transformers library, and TensorFlow's npm source is explicitly TensorFlow.js. Missing mappings return `not_configured` without snapshot or provider requests.

- GitHub and npm run independently in parallel, with five-second request deadlines covering response bodies and abort cleanup. One provider's failure does not discard the other provider's success.
- Successful results are fresh for **15 minutes from `fetchedAt`**, using per-process memory and, when configured, persisted snapshots. A fresh database snapshot survives service restarts and avoids a provider request. Stored payloads and timestamps are validated again on read; malformed or future-dated snapshots are ignored.
- Expired/missing snapshots trigger on-demand provider refresh. Only successful normalized data is written; provider failures never overwrite a stored success. Each snapshot read or write has a **one-second wait budget**. Failed or hung persistence cannot prevent provider access or discard its successful response; the wait budget is not a guarantee that the underlying SQL operation has been canceled.
- Failures are cached in memory for **60 seconds**. Rate limits instead use the provider retry deadline, bounded between one second and 24 hours, with a 60-second default when no valid deadline is supplied. Failures and retry state are not persisted as snapshots.
- If refresh fails but matching last-good data exists, the result retains `status: "ok"`, its original data and `fetchedAt`, and adds `stale: true`, `refreshStatus`, and optional `retryAt`. It uses the failure/retry deadline, not another 15-minute success lifetime. The inspector explicitly shows the retrieval time and `Last known ... snapshot / refresh ...`; it never presents that stale success as newly fetched.
- Caches and in-flight deduplication are source-aware. Changing catalog repository/package mappings rebuilds the current metadata service, and snapshot lookup uses the new source key; an old source's success cannot stand in for the new source. Old source-keyed rows are not automatically deleted.
- The browser caches inspector requests by canonical technology ID, deduplicates revisits, and bounds HTTP requests to 12 seconds. It honors failure/retry timing and isolates late responses from a newly selected technology. Transport failures offer a retry button; cached provider failures are retried on revisit after expiry. There is no automatic polling.
- The provider transport accepts the optional `pushed_at` and `archived` fields. The parser validates ISO-8601 *calendar correctness* (rejecting e.g. `2026-02-30` and `2026-13-40T99:99:99Z`) before exposing the values; invalid timestamps are dropped, not coerced. The persisted snapshot JSON includes these fields, and reads validate them on load.
- UI components never contact GitHub or npm directly. Tokens are read only by the server-only entry point and sent only to GitHub. External requests reject redirects, provider JSON is validated, error messages are sanitized, and links are constructed from trusted source mappings. If all metadata is unavailable, catalog descriptions and curated connections remain usable.

`refreshTechnologyMetadata(id)` is an exported, freshness-aware function that calls the same on-demand service; it does not force a cache bypass. **No background worker, scheduler, queue, or periodic refresh job is implemented.** PostgreSQL provides durable successful snapshots, not distributed request deduplication or rate-limit coordination.

### Intelligence layer

Phase 4 adds an intelligence layer that turns the curated universe and live metadata into a richer exploration experience. It is implemented as pure functions in `src/lib/intelligence.ts`, surfacing through two inspector sections and a bounded scene expansion:

- **Dynamic relationship exploration.** `dependencyExpansion(catalog, id, npmResult)` returns directed `CatalogRelationship`s whose targets are real catalog IDs, deduplicated against any pre-existing dependency edges and bounded to **8 visible edges** (`EXPANSION_LIMIT`). The expansion lives in `CatalogProvider`'s client-side state — never written to the database, never persisted across requests — and is reset on `popstate` and the in-app navigation event, so Back/Forward and selection changes collapse it. Edge IDs are namespaced `npm:<source>:<target>` so duplicate activation never produces duplicate lines. Dependency edges render as **dashed gold arcs** offset from the regular ecosystem curve; ecosystem edges stay solid and dim as before.
- **Dependency exploration.** `dependencyEvidence(catalog, id, npmResult)` only runs when the manifest's package name matches the catalog's curated `sources.npm` mapping, so fabricated dependency data is impossible. For each declared runtime/peer dependency that matches a curated neighbor, it emits one navigable `Explore in universe` button, one typed label (`Runtime dependency` / `Peer requirement` / `Dependency and peer requirement`), the version range, and a full explanation string. Packages outside the catalog render as external npm links that never become edges. Peer requirements are labeled separately and never bundled with runtime dependencies.
- **Technology recommendations.** `recommendations(catalog, id)` is deterministic and explainable. It scores every other catalog technology by **shared ecosystem neighbors**, with an exact reason string per suggestion (`Connected to React in the curated ecosystem graph.` or `Shares N ecosystem neighbor(s) with React: …`). It returns at most four suggestions, never includes the selected technology itself, and renders the reason next to each pick. Recommendations are graph-based suggestions, not endorsements.
- **Technology health / activity.** `activitySignal(githubResult, now)` classifies GitHub repository activity from the validated `pushedAt` and `archived` fields into `Active` (0–90 days), `Quiet` (91–365), `Low Activity` (over 365), `Archived`, or `Unknown`, with an explicit reason. Missing, malformed, or calendar-impossible timestamps are `Unknown` — never treated as zero or guessed. The classifier re-runs once a minute while the inspector stays open. The provenance/caption explicitly notes that this measures recency, not quality, security, or maintainability.
- **Technology profiles.** Profiles now progressively include: what the technology is, category/ecosystem, curated relationships, dependency evidence (in-catalog and external), peer dependencies, GitHub stars/forks/issues/language/pushedAt/archived, npm latest version/license/declared dependencies and peers, popularity and activity classification, repository/package information, deterministic recommendations, retrieval time, freshness label, and source/provenance notes.
- **Architecture.** No new migrations, no new tables, no Redis, no authentication. The catalog provider composes the existing `Catalog` with the ephemeral expansion list and re-derives the connection graph. The scene re-keys lines by `edge.id` and rebuilds geometry only when relationships change. Dependency expansion never touches PostgreSQL; it is purely client-side state, bounded to eight edges per package.
- **Empty/error states.** Stale snapshots, missing package names, rate-limit failures, and missing fields are all surfaced as `Unknown` or external links — never as fabricated values. The intelligence layer gracefully tolerates any non-`ok` npm result and returns no entries.

## Project structure

```text
migrations/
  0001_catalog.sql              Catalog, relationships, snapshots, constraints/triggers
  0002_catalog_validation.sql   Alias/identity constraints and catalog indexes
scripts/
  db.ts                        tsx migrate/seed CLI with environment loading
src/
  app/
    layout.tsx                 Metadata and root layout
    page.tsx                   Dynamic server page and catalog snapshot boundary
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
  database.spec.ts             Opt-in Node/tsx tests against real PostgreSQL
  catalog.spec.ts              Opt-in database API/UI and local fallback browser tests
  live-metadata.spec.ts        Opt-in real API smoke check
playwright.config.ts           Production-server browser test configuration
```

## Explore

- Drag to orbit; scroll or pinch to zoom; right-drag or two-finger drag to pan.
- Hover or keyboard-focus a technology for a preview; click to focus the camera.
- Follow connected technologies in the inspector. The seeded links are ecosystem relationships, not package dependencies. Expand **Why these connections?** for stored explanations, kind, provenance, and direction.
- From a curated package, expand its npm manifest in the profile to reveal up to **8 dashed gold dependency links** to in-catalog neighbors. Declared packages outside the catalog stay external npm links; peer requirements are labeled separately. The expansion collapses on Back/Forward and when you select another technology.
- Follow the **Recommended explorations** panel for explainable, neighbor-overlap-based suggestions. The reason string is shown for each pick.
- Inspect **Repository activity** in the metadata panel: `Active` (0–90 days), `Quiet` (91–365), `Low Activity` (over 365), `Archived`, or `Unknown` — measured from GitHub's last-push timestamp, with the actual push date shown alongside. Missing or invalid data is `Unknown`, never treated as zero.
- Filter by constellation to emphasize Web, Backend, Database, or AI technologies.
- Use the directory as a keyboard-friendly alternative to spatial navigation.
- Reset the view or press Escape to return to the full universe.
- Optional automatic rotation pauses on camera interaction and respects reduced-motion preferences.
- Press `/` or focus search to find names, partial names, aliases (such as `golang` or `postgres`), categories, or descriptions. Arrow keys navigate; Enter selects; Escape closes search without clearing the current selection.
- Search is global, independent of category filters. Results reuse the existing camera focus and graph highlighting.
- Selection uses shareable URLs such as `/?technology=react`, resolving catalog IDs and slugs and writing the selected slug. Direct links, reload, Back, and Forward restore selection without replacing the canvas. Reset clears the technology parameter and preserves unrelated URL parameters and the hash. Invalid IDs show a recoverable notice. Category filters are transient and selection takes precedence.
- The inspector shows catalog descriptions and curated neighbors immediately, then GitHub statistics and npm package/dependency information when available. Its bounded scroll area keeps the scene usable on mobile.

All 29 seeded relationships remain explicit curated, undirected ecosystem links. The schema can represent dependency relationships: npm provenance edges produced by the intelligence layer are also persisted to PostgreSQL when explicitly inserted (none are written by the runtime yet — the in-app expansion is purely client-side state). Connection curves and neighbor lookups are precomputed outside frame updates.

## Scene design

The client-only canvas renders the supplied catalog, initially 17 technology nodes across four color-coded constellations with 29 curved connections. Category-specific polyhedra, custom radial glow shaders, and orbital arcs provide depth without a post-processing dependency. The 2,600 background stars are rendered in one points draw call. Device pixel ratio is capped at 1.75.

Drei CameraControls provides damped orbit, dolly, pan, and animated focus transitions. The overview camera adapts to viewport aspect ratio. Accessible HTML node buttons are projected into 3D with Drei Html; the rest of the interface remains separate from rendering. Selection emphasizes a node and its immediate neighbors while dimming unrelated geometry. Missing WebGL falls back to the HTML directory. System fonts and inline artwork avoid external font/image requests.

The architecture is data-driven, but the visual layout is tuned for the small curated universe, not a production-scale graph. Database-backed additions can be rendered, but there is no automatic positioning, large-graph batching, or label level-of-detail system.

## Verification

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

Coverage includes graph integrity, search/keyboard input, URLs/history, canvas identity, inspector metadata, stale-response isolation, responsive bounds, provider validation/rate limits, source-aware snapshot freshness, bounded persistence failures, dependency evidence/expansion/dedupe, recommendations, activity-signal classification, and navigation/expansion reset on Back/Forward. Metadata fixtures are explicitly synthetic test-only data, not seeded statistics.

The Playwright configuration may reuse an existing server outside CI. A reused server does not inherit changed database/fallback environment settings. Use a separate `CODEVERSE_TEST_PORT` (for example `3101`) and `CI=1` to start a dedicated verification server without stopping an existing app. The test modes below are separate opt-ins; a default run does not verify all of them.

### Database tests

Export `TEST_DATABASE_URL` for a **disposable** PostgreSQL database, then run:

```sh
npm run test:db
```

This uses Node's test runner through `tsx`, not Playwright. The integration suite creates a random `codeverse_test_*` schema, runs migrations/seeding there, and drops that schema with `CASCADE` in cleanup. Its role needs schema-creation permission. It never uses `DATABASE_URL` or migrates/seeds `public`; without `TEST_DATABASE_URL`, the real-database suite is skipped. Tests exercise migration serialization/checksums, repeatable non-destructive seeding, ordering, constraints, mapping validation, and source-keyed snapshot upserts.

For the API/UI database tests in `tests/catalog.spec.ts`, use a **dedicated disposable local database on loopback port 55432**, with its `public` schema already migrated and seeded. These tests temporarily insert and clean up synthetic public rows and expect the initial 17/29 catalog. Do not target a working catalog with your edits. With `TEST_DATABASE_URL` set to that dedicated database, in a separate PowerShell session:

```powershell
if ([string]::IsNullOrWhiteSpace($env:TEST_DATABASE_URL)) {
  throw "Set TEST_DATABASE_URL to the dedicated disposable database first."
}
$env:DATABASE_URL = $env:TEST_DATABASE_URL
$env:CODEVERSE_DATABASE_TESTS = "1"
$env:CODEVERSE_EXPECT_FALLBACK = "0"
npm run db:migrate
npm run db:seed
npm run build
npx playwright test tests/catalog.spec.ts
```

The application and test runner must use the same URL. These opt-in tests exercise database-only names/aliases/slugs in API search and the scene, relationship explanations, history, missing-source statuses, and persisted metadata reuse across service instances.

### Fallback and live checks

To opt into the two local-catalog fallback tests, use a fresh server process with no usable `DATABASE_URL` and `CODEVERSE_EXPECT_FALLBACK=1`. For an explicit unavailable-database run that also overrides any `.env.local` connection, use a loopback port you have confirmed is unused, for example `55433`:

```powershell
$env:DATABASE_URL = "postgresql://127.0.0.1:55433/codeverse_unavailable"
$env:CODEVERSE_DATABASE_TESTS = "0"
$env:CODEVERSE_EXPECT_FALLBACK = "1"
npx playwright test tests/catalog.spec.ts
```

Build first if needed, and stop any existing application server before this run. A process with a previous successful database read may correctly return its last-known database catalog instead of the local catalog these tests expect.

The live provider smoke test is skipped by default. To opt in (PowerShell, after build):

```powershell
$env:CODEVERSE_LIVE_METADATA="1"
npx playwright test tests/live-metadata.spec.ts
```

Phase 4 verification: the seeded PostgreSQL run passed 134 Playwright tests (database-only and live-network tests intentionally skipped) plus 16 intelligence unit tests and 76 metadata-transport validation cases. The unavailable-database run passed the local-fallback subset. Typecheck, lint, production build, and dependency audit passed. Desktop/mobile screenshots are generated under the ignored `test-results/` directory. Chromium uses software WebGL during automated tests; aesthetic review and real-device GPU performance remain separate checks.

## Scope and constraints

This documents the implemented **Phase 4** work. PostgreSQL catalog and successful metadata persistence, lazy bounded dependency exploration, deterministic explainable recommendations, and GitHub activity classification are all implemented. Authentication/accounts, bookmarks, personalized universes, Redis, social features, collaboration, advanced analytics, and deployment infrastructure are not. There is no catalog editing UI, automatic universe expansion beyond the bounded dependency overlay, dependency-graph import for npm manifests beyond curated source mappings, background refresh worker, or distributed cache coordination.

Database edits are reflected by subsequent page/API reads, not pushed into open browser sessions. Categories and visual styles remain fixed in code, and source mappings must pass validation. Catalog fallback is designed for availability, not database backup or replication. The live indicator means the interactive scene is ready, not that metadata is live or that PostgreSQL is connected; use the catalog origin and metadata freshness labels for those states.
