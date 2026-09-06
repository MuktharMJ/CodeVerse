# CODEVERSE

**Navigate the universe of software.**

A Phase 2 software discovery experience built on the original cinematic atlas. Built with Next.js App Router, TypeScript, React Three Fiber, Three.js, Drei, and Tailwind CSS. Search and the curated universe work without external services. GitHub/npm metadata enriches the inspector when available. No new dependencies were needed for Phase 2.

## Run locally

Requires Node.js 20.9 or newer.

```sh
npm install
npm run dev
```

Open http://127.0.0.1:3000.

## Project structure

```text
src/
  app/
    layout.tsx                 Metadata and root layout
    page.tsx                   Landing page
    globals.css                Space atmosphere and responsive interface styles
    api/technologies/[id]/     Server-side metadata GET endpoint
  data/
    technologies.ts            Typed nodes, categories, and undirected relationships
    technology-sources.ts      Explicit GitHub repository/npm package mappings
  components/
    universe-explorer.tsx      Interaction state, directory, help, and error boundary
    explorer-overlay.tsx       Branding, category filters, previews, and inspector
    technology-icon.tsx        Lightweight inline technology glyphs
    technology-search.tsx      Accessible ranked search combobox
    technology-metadata.tsx    Cached, independently loading inspector signals
    scene/
      universe-scene.tsx       Canvas, starfield, connections, guides, and camera rig
      technology-node.tsx      Geometric core, glow shader, orbital rings, and label
  lib/
    search.ts                 Precomputed local search index and aliases
    selection-url.ts          Shareable selection and browser history subscription
  services/
    metadata.ts               Server-only entry and optional token access
    metadata-transport.ts     Validated providers, timeouts, cache, deduplication
  types/
    metadata.ts               Shared provider/result contracts
tests/
  universe.spec.ts             Graph integrity and desktop/mobile browser tests
  discovery.spec.ts            Search, URLs, inspector, fallback, responsive tests
  metadata-services.spec.ts    Deterministic mocked provider/service tests
  live-metadata.spec.ts        Opt-in real API smoke check
playwright.config.ts          Production-server browser test configuration
```

## Explore

- Drag to orbit; scroll or pinch to zoom; right-drag or two-finger drag to pan.
- Hover or keyboard-focus a technology for a preview; click to focus the camera.
- Follow connected technologies in the inspector. These are ecosystem relationships, not package dependencies.
- Filter by constellation to emphasize Web, Backend, Database, or AI technologies.
- Use the directory as a keyboard-friendly alternative to spatial navigation.
- Reset the view or press Escape to return to the full universe.
- Optional automatic rotation pauses on camera interaction and respects reduced-motion preferences.
- Press `/` or focus search to find names, partial names, aliases (such as `golang` or `postgres`), categories, or descriptions. Arrow keys navigate; Enter selects; Escape closes search without clearing the current selection.
- Search is global, independent of category filters. Results reuse the existing camera focus and graph highlighting.
- Selection uses shareable URLs such as `/?technology=react`. Direct links, reload, Back, and Forward restore selection without replacing the canvas. Reset clears the technology parameter and preserves unrelated URL parameters. Invalid IDs show a recoverable notice. Category filters are transient and selection takes precedence.
- The inspector shows local descriptions and curated neighbors immediately, then GitHub statistics and npm package/dependency information when available. Its bounded scroll area keeps the scene usable on mobile.

## External metadata and environment

`GET /api/technologies/[id]` accepts only curated IDs. Unknown IDs return 404; valid IDs return independently tagged GitHub/npm results, including partial failure states. UI components never contact providers directly. Fixed, curated upstream hosts prevent arbitrary URL fetching. Provider JSON is validated, error messages are sanitized, and all external links use explicit trusted source mappings.

GitHub's repository API supplies repository name, stars, forks, open issues (including pull requests), language, and URL. npm's latest-version endpoint supplies package/version/license and declared dependency/peer-dependency maps. These are real provider values, not hardcoded statistics. Missing values are labeled rather than estimated. Hugging Face uses its Transformers library as a representative repository; TensorFlow's npm source is explicitly TensorFlow.js. Technologies without a meaningful curated npm package are labeled accordingly.

No environment variable is required. For higher GitHub API limits, optionally define `GITHUB_TOKEN` in `.env.local`, following `.env.example`. It is read only by the server-only service. Never use a `NEXT_PUBLIC_` prefix. `.env.local` and other environment files are ignored; `.env.example` contains no secret.

Provider requests run in parallel, with five-second timeouts covering response bodies and abort cleanup. Successful provider results are cached for 15 minutes per server process, failures for 60 seconds, and rate limits until the indicated retry time (bounded to 24 hours for pathological headers). In-flight requests are deduplicated. Client requests also use a bounded curated-ID cache and a 12-second timeout, preventing repeated calls on hover or rerender. All-failure responses never replace local content; network failures offer a retry button. Cached provider failures can be retried by revisiting after expiry. Caches are in-memory, not persistence or distributed rate-limit infrastructure.

All 29 graph relationships remain explicit curated ecosystem links, with type, direction, and provenance fields ready for future dependency relationships. npm manifests are shown separately and never auto-insert nodes or edges. Connection curves and neighbor lookups are precomputed outside frame updates.

## Scene design

The client-only canvas renders 17 technology nodes across four color-coded constellations with 29 curved connections. Category-specific polyhedra, custom radial glow shaders, and orbital arcs provide depth without a post-processing dependency. The 2,600 background stars are rendered in one points draw call. Device pixel ratio is capped at 1.75.

Drei CameraControls provides damped orbit, dolly, pan, and animated focus transitions. The overview camera adapts to viewport aspect ratio. Accessible HTML node buttons are projected into 3D with Drei Html; the rest of the interface remains separate from rendering. Selection emphasizes a node and its immediate neighbors while dimming unrelated geometry. Missing WebGL falls back to the HTML directory. System fonts and inline artwork avoid external font/image requests.

The architecture is data-driven, but this prototype is tuned and tested for its 17 nodes, not a production-scale graph. A future large graph should use instanced cores, batched connections, and label level-of-detail rather than one HTML label per node.

## Verification

```sh
npm run typecheck
npm run lint
npm run build
npm run test:e2e
```

Browser tests use a production build and start/stop a local server automatically. First install Chromium inside the project (PowerShell):

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH="$PWD\.cache\ms-playwright"
npx playwright install chromium
```

Tests preserve Phase 1 coverage and add search ranking/keyboard input, direct URLs/history, canvas identity, inspector metadata, request deduplication, stale-response isolation, network/provider failures, rate limits, malformed payloads, secrets isolation, and mobile/tablet bounds. Metadata fixtures are explicitly synthetic test-only data. The live provider test is skipped by default. To opt in (PowerShell, after build):

```powershell
$env:CODEVERSE_LIVE_METADATA="1"
npx playwright test tests/live-metadata.spec.ts
```

Desktop/mobile screenshots are generated under the ignored `test-results/` directory. Chromium uses software WebGL during automated tests; aesthetic screenshot review and real-device GPU performance should still be reviewed separately.

## Intentionally deferred

No authentication/accounts, bookmarks, personalized universes, PostgreSQL/Redis persistence, deployment, social features, collaboration, or advanced analytics. There is no automatic universe expansion or dependency-graph import. The live indicator means the interactive scene is ready, not a real-time data feed. This remains Phase 2 only.
