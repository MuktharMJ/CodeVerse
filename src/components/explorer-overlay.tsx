import { useEffect, useRef } from "react";
import {
  categories,
  type Category,
  type CategoryFilter,
} from "../data/technologies";
import { TechnologyIcon } from "./technology-icon";
import { TechnologySearch } from "./technology-search";
import { TechnologyMetadata } from "./technology-metadata";
import { useCatalog } from "./catalog-provider";
import { EcosystemRecommendations } from "./ecosystem-intelligence";

export interface ExplorerOverlayProps {
  selectedId: string | null;
  hoveredId: string | null;
  activeCategory: CategoryFilter;
  onCategoryChange: (category: CategoryFilter) => void;
  onSelect: (id: string) => void;
  onReset: () => void;
  onZoom: (direction: 1 | -1) => void;
  isAutoRotate: boolean;
  onToggleRotate: () => void;
  onShowHelp: () => void;
  sceneReady: boolean;
  sceneFailed: boolean;
  reducedMotion: boolean;
}

type IconName = "search" | "plus" | "minus" | "reset" | "rotate" | "pause" | "help" | "close" | "arrow" | "compass";

function Icon({ name, className = "ui-icon" }: { name: IconName; className?: string }) {
  const shapes = {
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    minus: <path d="M5 12h14" />,
    reset: <><path d="M4 10a8 8 0 1 1 1.5 7M4 4v6h6" /><circle cx="12" cy="12" r="2" /></>,
    rotate: <><path d="M19 8a8 8 0 0 0-13-2L3 9m0-5v5h5M5 16a8 8 0 0 0 13 2l3-3m0 5v-5h-5" /></>,
    pause: <><path d="M8 5v14M16 5v14" /></>,
    help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .7-1.5 1-1.5 2M12 16h.01" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    compass: <><circle cx="12" cy="12" r="9" /><path d="m16 8-2.5 5.5L8 16l2.5-5.5Z" /></>,
  };

  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {shapes[name]}
    </svg>
  );
}

export function ExplorerOverlay({
  selectedId,
  hoveredId,
  activeCategory,
  onCategoryChange,
  onSelect,
  onReset,
  onZoom,
  isAutoRotate,
  onToggleRotate,
  onShowHelp,
  sceneReady,
  sceneFailed,
  reducedMotion,
}: ExplorerOverlayProps) {
  const { technologies, relationships, connections, technologyById, getConnectedIds, origin, stale } = useCatalog();
  const selected = selectedId ? technologyById[selectedId] : undefined;
  const hovered = hoveredId && hoveredId !== selectedId ? technologyById[hoveredId] : undefined;
  const connected = selected ? getConnectedIds(selected.id).map((id) => technologyById[id]).filter(Boolean) : [];
  const inspector = useRef<HTMLElement>(null);
  useEffect(() => { if (inspector.current) inspector.current.scrollTop = 0; }, [selectedId]);

  return (
    <div className={`overlay${selected ? " has-selection" : ""}`} data-scene-ready={sceneReady}>
      <header className="topbar">
        <div className="brand" aria-label="Codeverse software atlas">
          <span className="brand-mark" aria-hidden="true"><span>C</span><span className="brand-slash">/</span><span>V</span></span>
          <span className="brand-label">SOFTWARE ATLAS</span>
        </div>
        <div className="edition">
          <span className="edition-label" title={stale ? "Last known database catalog; connection unavailable" : origin === "database" ? "Persistent PostgreSQL catalog" : "Curated local fallback catalog"}>EXPLORER / 004 · {stale ? "CACHED" : origin === "database" ? "CONNECTED" : "LOCAL"}</span>
          <span className="live-status" role="status">
            <span className={`live-dot${sceneReady ? " is-live" : " is-loading"}`} aria-hidden="true" />
            {sceneFailed ? "DIRECTORY MODE" : sceneReady ? "LIVE UNIVERSE" : "MAPPING THE UNIVERSE"}
          </span>
        </div>
      </header>

      <section className="hero" aria-labelledby="codeverse-title">
        <p className="eyebrow">EVERYTHING IS CONNECTED</p>
        <h1 id="codeverse-title" className="hero-title">CODEVERSE</h1>
        <p className="hero-subtitle">Navigate the universe of software.</p>
        <TechnologySearch onSelect={onSelect} />
      </section>

      <nav className="category-panel" aria-label="Filter technologies by constellation">
        <h2 className="section-label">CONSTELLATIONS</h2>
        <div className="category-list">
          <button
            type="button"
            className={`category-button${activeCategory === "All" ? " is-active" : ""}`}
            data-category="All"
            aria-pressed={activeCategory === "All"}
            onClick={() => onCategoryChange("All")}
          >
            <span className="category-dot" aria-hidden="true" />
            <span className="category-name">All technologies</span>
            <span className="category-count">{technologies.length}</span>
          </button>
          {(Object.keys(categories) as Category[]).map((category) => (
            <button
              key={category}
              type="button"
              className={`category-button${activeCategory === category ? " is-active" : ""}`}
              data-category={category}
              aria-pressed={activeCategory === category}
              title={categories[category].subtitle}
              onClick={() => onCategoryChange(category)}
            >
              <span className="category-dot" aria-hidden="true" />
              <span className="category-name">{categories[category].label}</span>
              <span className="category-count">{technologies.filter((technology) => technology.category === category).length}</span>
            </button>
          ))}
        </div>
        <p className="category-caption">Different worlds. Shared gravity.</p>
      </nav>

      <aside className="context-note" aria-labelledby="context-note-title">
        <h2 id="context-note-title" className="section-label">A CONNECTED WORLD</h2>
        <p>No technology exists alone.<br />Follow a connection.<br />Find a new possibility.</p>
        <span className="context-rule" aria-hidden="true" />
      </aside>

      {selected && (
        <aside ref={inspector} className="selected-panel" data-category={selected.category} aria-labelledby="selected-technology-title" tabIndex={0}>
          <div className="selected-panel-topline">
            <span className="section-label">IN FOCUS</span>
            <button type="button" className="panel-close icon-button" onClick={onReset} aria-label="Close technology details and return to universe" title="Back to universe">
              <Icon name="close" />
            </button>
          </div>
          <div className="selected-identity">
            <TechnologyIcon symbol={selected.symbol} className="selected-icon" />
            <div>
              <span className="technology-category"><span className="category-dot" aria-hidden="true" />{categories[selected.category].label}</span>
              <h2 id="selected-technology-title" className="selected-title">{selected.name}</h2>
            </div>
          </div>
          <p className="selected-description">{selected.description}</p>
          <p className="selected-detail">{selected.detail}</p>
          <section className="connected-section" aria-labelledby="connected-technologies-title">
            <h3 id="connected-technologies-title" className="section-label">CONNECTED TECHNOLOGIES <span className="connection-count">{connected.length}</span></h3>
            <div className="connected-list">
              {connected.map((technology) => (
                <button key={technology.id} type="button" className="connected-button" data-category={technology.category} onClick={(event) => { const panel = event.currentTarget.closest("aside"); panel?.focus({ preventScroll: true }); if (panel) panel.scrollTop = 0; onSelect(technology.id); }} aria-label={`Explore ${technology.name}, ${categories[technology.category].label}`}>
                  <TechnologyIcon symbol={technology.symbol} className="connected-icon" />
                  <span>{technology.name}</span>
                  <Icon name="arrow" />
                </button>
              ))}
            </div>
          </section>
          <p className="connection-note">Solid lines: ecosystem links. Dashed gold lines: declared manifest requirements, directed from source to target.</p>
          <details className="relationship-details"><summary>Why these connections?</summary>{relationships.filter((edge) => edge.source === selected.id || edge.target === selected.id).map((edge) => <div key={edge.id}><p>{technologyById[edge.source].name} {edge.directed ? "→" : "↔"} {technologyById[edge.target].name}</p><span>{edge.kind === "dependency" ? "Declared dependency" : "Ecosystem relationship"} / {edge.provenance}</span><p>{edge.explanation ?? "An explicit relationship in the CODEVERSE catalog."}</p></div>)}</details>
          <TechnologyMetadata key={selected.id} id={selected.id} onSelect={onSelect} />
          <EcosystemRecommendations id={selected.id} onSelect={onSelect} />
        </aside>
      )}

      {hovered && (
        <aside className="hover-card" data-category={hovered.category} aria-label={`${hovered.name} preview`}>
          <TechnologyIcon symbol={hovered.symbol} className="hover-icon" />
          <div className="hover-copy">
            <span className="technology-category">{categories[hovered.category].label}</span>
            <h2 className="hover-title">{hovered.name}</h2>
            <p className="hover-description">{hovered.description}</p>
            <span className="hover-hint">Select to explore connections</span>
          </div>
        </aside>
      )}

      <div className="view-controls" role="group" aria-label="Universe view controls">
        <button type="button" className="view-button icon-button" onClick={() => onZoom(1)} disabled={!sceneReady} aria-label="Zoom in" title="Zoom in"><Icon name="plus" /></button>
        <button type="button" className="view-button icon-button" onClick={() => onZoom(-1)} disabled={!sceneReady} aria-label="Zoom out" title="Zoom out"><Icon name="minus" /></button>
        <span className="controls-divider" aria-hidden="true" />
        <button type="button" className="view-button icon-button" onClick={onReset} aria-label="Reset view and return to universe" title="Reset view"><Icon name="reset" /></button>
        <button type="button" className={`view-button icon-button${isAutoRotate ? " is-active" : ""}`} onClick={onToggleRotate} disabled={reducedMotion || !sceneReady} aria-label="Automatic rotation" aria-pressed={isAutoRotate && !reducedMotion} title={reducedMotion ? "Rotation disabled by your reduced-motion preference" : isAutoRotate ? "Pause automatic rotation" : "Start automatic rotation"}><Icon name={isAutoRotate ? "pause" : "rotate"} /></button>
        <button type="button" className="view-button icon-button" onClick={onShowHelp} aria-label="Show exploration controls and help" title="Exploration help"><Icon name="help" /></button>
      </div>

      <div className={`selection-breadcrumb${selected ? " is-selected" : ""}`}>
        {selected ? (
          <>
            <span className="breadcrumb-current" data-category={selected.category}><span className="category-dot" aria-hidden="true" />{selected.name}</span>
            <span className="breadcrumb-divider" aria-hidden="true">/</span>
            <button type="button" className="back-to-universe" onClick={onReset}>Back to universe <Icon name="arrow" /></button>
          </>
        ) : (
          <><Icon name="compass" /><span>An open universe. Endless possibilities.</span></>
        )}
      </div>

      <footer className="footer">
        <div className="universe-stats" aria-label={`${technologies.length} technologies and ${connections.length} connections`}>
          <span><strong>{technologies.length}</strong> technologies</span>
          <span className="footer-separator" aria-hidden="true">/</span>
          <span><strong>{connections.length}</strong> connections</span>
        </div>
        <ul className="color-legend" aria-label="Constellation colors">
          {(Object.keys(categories) as Category[]).map((category) => (
            <li key={category} className="legend-item" data-category={category}><span className="category-dot" aria-hidden="true" />{categories[category].label}</li>
          ))}
        </ul>
        <p className="interaction-hint desktop-hint">Drag to orbit <span aria-hidden="true">/</span> Scroll to explore</p>
        <p className="interaction-hint mobile-hint">Swipe to orbit <span aria-hidden="true">/</span> Pinch to explore <span aria-hidden="true">/</span> Tap a technology</p>
        <div className="phase-label"><span className="phase-indicator" aria-hidden="true"><span className="is-active" /><span className="is-active" /><span className="is-active" /></span><span>PHASE 04</span></div>
      </footer>
    </div>
  );
}
