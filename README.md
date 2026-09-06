# CODEVERSE

**Navigate the universe of software.**

A Phase 1 visual prototype of an interactive software atlas. Built with Next.js App Router, TypeScript, React Three Fiber, Three.js, Drei, and Tailwind CSS. No external services or credentials are required.

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
  data/
    technologies.ts            Typed nodes, categories, and undirected relationships
  components/
    universe-explorer.tsx      Interaction state, directory, help, and error boundary
    explorer-overlay.tsx       Branding, category filters, previews, and inspector
    technology-icon.tsx        Lightweight inline technology glyphs
    scene/
      universe-scene.tsx       Canvas, starfield, connections, guides, and camera rig
      technology-node.tsx      Geometric core, glow shader, orbital rings, and label
tests/
  universe.spec.ts             Graph integrity and desktop/mobile browser tests
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

Tests cover graph integrity, scene readiness, hover, camera movement, selection, neighbor navigation, filtering, view controls, help, mobile bounds, reduced motion, and the WebGL fallback. Desktop/mobile screenshots are generated under the ignored `test-results/` directory. Chromium uses software WebGL during automated tests; real-device GPU performance should still be reviewed separately.

## Intentionally outside Phase 1

Search is a clearly labeled visual preview only. No authentication, accounts, databases, APIs, GitHub/npm integrations, live ecosystem data, persistence, or deployment are implemented. All technology information is local static data. The live indicator means the interactive scene is ready, not that it is receiving live data.
