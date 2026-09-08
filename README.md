# CODEVERSE

**Navigate the universe of software.**

An intelligent, interactive 3D atlas of the software ecosystem — built with real GitHub and npm data, a persistent PostgreSQL catalog, and an explainable intelligence layer that surfaces dependencies, recommendations, and repository activity. Curated, never fabricated.

![CODEVERSE — interactive 3D atlas of the software ecosystem](https://codeverse.example/icon)

[Overview](#overview) · [Features](#features) · [Stack](#stack) · [Architecture](#architecture) · [Scope](#scope) · [License](#license)

---

## Overview

CODEVERSE turns a curated catalog of 17 foundational software technologies into a navigable 3D universe. Each point in the universe is a technology; each line is an explicit, sourced connection between technologies. Selecting a technology opens an inspector that streams its live GitHub statistics and latest npm manifest, expands its dependency graph as dashed gold arcs on the canvas, and surfaces explainable recommendations based on shared ecosystem neighbors.

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

| Layer | Technology |
| --- | --- |
| Framework | **Next.js 16** (App Router, Turbopack, Route Handlers) with **React 19** |
| Language | **TypeScript** in strict mode |
| 3D Rendering | **React Three Fiber**, **@react-three/drei**, **Three.js** |
| Styling | **Tailwind CSS 4** (minimal; most styles in a single `globals.css`) |
| Database | **PostgreSQL** with **Postgres.js** driver — raw parameterized SQL, no ORM |
| Testing | **Playwright** (end-to-end) and **Node tsx --test** (unit) |

## Architecture

```text
src/
  app/
    layout.tsx                 Root layout, metadata, Open Graph, app icon
    page.tsx                   Dynamic server page and catalog snapshot boundary
    icon.tsx                   Generated CODEVERSE monogram favicon
    globals.css                Space atmosphere and responsive interface styles
    api/catalog/route.ts       Full catalog and ranked query GET endpoint
    api/technologies/[id]/     Server-side metadata GET endpoint
  data/
    technologies.ts            Nodes, category styling, curated relationships
    technology-sources.ts      Seed GitHub/npm mappings and notes
    local-catalog.ts           Shared seed and local fallback catalog
  db/
    client.ts                  Lazy bounded Postgres.js pool
    migrate.ts                 Ordered SQL migrations with advisory lock and checksums
    seed.ts                    Non-destructive transactional catalog inserts
    catalog.ts                 Consistent ordered reads and mapping validation
    snapshots.ts               Source-keyed snapshot reads/upserts
  components/
    catalog-provider.tsx       Shared snapshot context, precomputed indexes
    universe-explorer.tsx      Interaction state, directory, help, error boundary
    explorer-overlay.tsx       Branding, category filters, previews, inspector
    ecosystem-intelligence.tsx Dependency exploration and recommendation panels
    technology-icon.tsx        Lightweight inline technology glyphs
    technology-search.tsx      Accessible ranked search combobox
    technology-metadata.tsx    Inspector signals, retrieval time, stale/failure labels
    scene/
      universe-scene.tsx       Canvas, starfield, dependency edges, camera rig
      technology-node.tsx      Geometric core, glow shader, orbital rings, label
  lib/
    catalog.ts                 ID/slug resolution and adjacency indexing
    intelligence.ts            Dependency evidence/expansion, recommendations, activity
    search.ts                  Ranked search factory and seed aliases
    selection-url.ts           Shareable selection and browser history
  services/
    catalog.ts                 Server-only database read with fallback chain
    metadata.ts                Source resolution, token handling, refresh entry point
    metadata-transport.ts      Providers, validation, deadlines, cache, stale snapshots
  types/
    catalog.ts                 Shared catalog, technology, and relationship contracts
    metadata.ts                Shared provider/result contracts
```

### Security posture

- GitHub token is server-only (`server-only` import) and sent exclusively to `api.github.com`.
- Provider URLs are built from validated source mappings on fixed hosts; raw JSON is parsed and validated before exposure.
- No `dangerouslySetInnerHTML`, no `eval`, no client-side secrets.
- Hardened response headers: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, and strict `Permissions-Policy`.

## Scope

CODEVERSE is feature-complete for its planned release:

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

### Out of scope

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