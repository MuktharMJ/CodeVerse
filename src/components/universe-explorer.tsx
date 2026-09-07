"use client";

import dynamic from "next/dynamic";
import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ExplorerOverlay } from "./explorer-overlay";
import { categories, type CategoryFilter } from "@/data/technologies";
import { useCatalog } from "./catalog-provider";
import { navigateToTechnology, useTechnologySelection } from "@/lib/selection-url";

const UniverseScene = dynamic(() => import("./scene/universe-scene"), { ssr: false });

class SceneBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? <div className="scene-fallback">Your browser couldn&apos;t open the 3D universe.<br />Explore the technology directory below instead.</div> : this.props.children; }
}

export function UniverseExplorer() {
  const { technologies, technologyById, resolveId, origin } = useCatalog();
  const { selectedId, invalidSelection } = useTechnologySelection();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [categoryFilter, setActiveCategory] = useState<CategoryFilter>("All");
  const activeCategory = selectedId ? "All" : categoryFilter;
  const [isAutoRotate, setAutoRotate] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [sceneFailed, setSceneFailed] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [zoomRequest, setZoomRequest] = useState<{ direction: 1 | -1; key: number } | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showDirectory, setShowDirectory] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const ready = useCallback(() => setSceneReady(true), []);
  const interact = useCallback(() => { setAutoRotate(false); setHoveredId(null); }, []);
  const fail = useCallback(() => { setSceneFailed(true); setSceneReady(true); setShowDirectory(true); }, []);

  const reset = useCallback(() => {
    navigateToTechnology(null); setHoveredId(null); setActiveCategory("All"); setResetKey((key) => key + 1);
  }, []);
  const select = useCallback((id: string) => { const resolved = resolveId(id); if (!resolved) return; navigateToTechnology(technologyById[resolved].slug); setHoveredId(null); setActiveCategory("All"); setAutoRotate(false); setShowDirectory(false); }, [resolveId, technologyById]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented && !dialog.current?.open) { reset(); setShowDirectory(false); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [reset]);

  useEffect(() => {
    if (showHelp) dialog.current?.showModal();
    else dialog.current?.close();
  }, [showHelp]);

  return <main className="universe-explorer" data-catalog-origin={origin} aria-label="CODEVERSE interactive software universe">
    <div className="space-backdrop" aria-hidden="true"><div className="nebula nebula-web" /><div className="nebula nebula-ai" /><div className="nebula nebula-data" /><div className="space-grain" /></div>
    <div className="scene-container" aria-label="Interactive 3D technology graph">
      <SceneBoundary onError={fail}><UniverseScene selectedId={selectedId} hoveredId={hoveredId} activeCategory={activeCategory} isAutoRotate={isAutoRotate} reducedMotion={reducedMotion} resetKey={resetKey} zoomRequest={zoomRequest} onSelect={select} onHover={setHoveredId} onReady={ready} onInteract={interact} onUnavailable={fail} /></SceneBoundary>
    </div>
    <div className="scene-vignette" aria-hidden="true" />
    {!sceneReady && <div className="scene-loading" role="status"><span className="loading-orbit" />Mapping the universe<span>{technologies.length} technologies. Infinite possibilities.</span></div>}
    <ExplorerOverlay selectedId={selectedId} hoveredId={hoveredId} activeCategory={activeCategory} onCategoryChange={(category) => { setActiveCategory(category); navigateToTechnology(null); setHoveredId(null); }} onSelect={select} onReset={reset} onZoom={(direction) => setZoomRequest((request) => ({ direction, key: (request?.key ?? 0) + 1 }))} isAutoRotate={isAutoRotate} onToggleRotate={() => setAutoRotate((value) => !value)} onShowHelp={() => setShowHelp(true)} sceneReady={sceneReady && !sceneFailed} sceneFailed={sceneFailed} reducedMotion={reducedMotion} />
    {invalidSelection && <div className="navigation-notice" role="status">That technology isn&apos;t in this universe yet. <button onClick={reset}>Return to the atlas</button></div>}
    <button className="directory-toggle" onClick={() => setShowDirectory((value) => !value)} aria-expanded={showDirectory} aria-controls="technology-directory">{showDirectory ? "Close directory" : "Browse technologies"}<span aria-hidden="true">{showDirectory ? "−" : "↗"}</span></button>
    {showDirectory && <section id="technology-directory" className="technology-directory" aria-label="Technology directory"><div className="section-label">EXPLORE THE ECOSYSTEM</div><div className="directory-grid">{technologies.filter((technology) => activeCategory === "All" || technology.category === activeCategory).map((technology) => <button key={technology.id} onClick={() => select(technology.id)}><span className="category-dot" style={{ background: categories[technology.category].color }} /><span>{technology.name}</span><span className="directory-category">{technology.category}</span></button>)}</div></section>}
    <dialog ref={dialog} className="help-dialog" onCancel={() => setShowHelp(false)} onClick={(event) => { if (event.target === event.currentTarget) setShowHelp(false); }} aria-labelledby="help-title">
      <div className="section-label">YOUR FIELD GUIDE</div><button className="help-close" aria-label="Close field guide" onClick={() => setShowHelp(false)}>×</button>
      <h2 id="help-title">A little space to explore.</h2><p>Follow your curiosity. Every point is a technology, every line a connection worth discovering.</p>
      <dl><div><dt>Orbit</dt><dd>Drag with one finger or the left mouse button</dd></div><div><dt>Zoom</dt><dd>Pinch, scroll, or use the + / − controls</dd></div><div><dt>Pan</dt><dd>Drag with two fingers or the right mouse button</dd></div><div><dt>Discover</dt><dd>Hover or keyboard-focus a technology</dd></div><div><dt>Focus</dt><dd>Click a node or choose one from the directory</dd></div><div><dt>Return</dt><dd>Press Escape or reset the view</dd></div></dl>
      <p className="help-footnote">Solid lines show curated ecosystem pairings. Expand a package manifest in its profile to reveal up to eight dashed dependency links. Peer requirements are labeled separately; no packages or relationships are guessed.</p><button className="help-action" onClick={() => setShowHelp(false)}>Let&apos;s explore <span aria-hidden="true">↗</span></button>
    </dialog>
    <div className="sr-only" aria-live="polite">{selectedId ? `Focused on ${technologies.find((technology) => technology.id === selectedId)?.name}. Connected technologies are available in the details panel.` : `${activeCategory === "All" ? "All constellations" : activeCategory} in view.`}</div>
  </main>;
}
