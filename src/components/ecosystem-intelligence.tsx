"use client";
import { useCatalog } from "./catalog-provider";
import { dependencyEvidence, dependencyExpansion, recommendations } from "@/lib/intelligence";
import type { ProviderResult, NpmMetadata } from "@/types/metadata";

export function EcosystemRecommendations({ id, onSelect }: { id: string; onSelect: (id: string) => void }) {
  const catalog = useCatalog();
  const suggestions = recommendations(catalog.baseCatalog, id);
  return <section className="intelligence-section" aria-label="Recommended explorations"><h3 className="section-label">FOLLOW THE CONNECTIONS</h3>{suggestions.length ? suggestions.map(({ technology, reason }) => <button className="recommendation-button" key={technology.id} onClick={(event) => { event.currentTarget.closest("aside")?.focus({ preventScroll: true }); onSelect(technology.id); }}><span>{technology.name}</span><small>{reason}</small></button>) : <p className="metadata-caption">No supported suggestions in this catalog yet.</p>}<p className="metadata-caption">Graph-based suggestions, not endorsements or claims of interchangeability.</p></section>;
}

export function DependencyExplorer({ id, result, onSelect }: { id: string; result: ProviderResult<NpmMetadata>; onSelect: (id: string) => void }) {
  const catalog = useCatalog();
  const evidence = dependencyEvidence(catalog.baseCatalog, id, result);
  const expansion = dependencyExpansion(catalog.baseCatalog, id, result);
  const expanded = catalog.expansion?.source === id;
  if (result.status !== "ok") return null;
  return <section className="intelligence-section" aria-label="Dependency exploration"><h3 className="section-label">EXPLORE THE MANIFEST</h3>
    <p className="metadata-caption">{result.data.name}@{result.data.version} / {result.stale ? "Last-known manifest" : "npm manifest"}. Exact catalog package matches only.</p>
    {expansion.edges.length > 0 && <button className="expansion-button" aria-pressed={expanded} onClick={() => catalog.setExpansion(expanded ? null : { source: id, edges: expansion.edges })}>{expanded ? "Collapse dependency links" : `Show ${expansion.edges.length} dependency links`}</button>}
    {expansion.omitted > 0 && <p className="metadata-caption">{expansion.omitted} additional matches omitted. Expansion is limited to eight targets.</p>}
    <div className="dependency-exploration-list">{evidence.map((entry) => <div key={entry.name}>{entry.targetId ? <button onClick={(event) => { event.currentTarget.closest("aside")?.focus({ preventScroll: true }); onSelect(entry.targetId!); }}>{entry.name}<span>Explore in universe</span></button> : <a href={entry.url} target="_blank" rel="noopener noreferrer">{entry.name}<span>View on npm ↗</span></a>}<small>{entry.label} / {entry.range}</small></div>)}</div>
    {!evidence.length && <p className="metadata-caption">No navigable dependencies declared in this manifest.</p>}
    <p className="metadata-caption">Dashed gold lines: directed manifest requirements. Peer requirements are not bundled runtime dependencies. Packages outside this catalog stay external.</p>
  </section>;
}
