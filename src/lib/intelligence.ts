import type { Catalog, CatalogRelationship } from "../types/catalog";
import type { GitHubMetadata, NpmMetadata, ProviderResult } from "../types/metadata";

export const EXPANSION_LIMIT = 8;
export const isPackageName = (name: string) => name.length <= 214 && /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(name);

export function dependencyEvidence(catalog: Catalog, id: string, result: ProviderResult<NpmMetadata>) {
  const source = catalog.technologies.find((technology) => technology.id === id);
  if (result.status !== "ok" || !source?.sources.npm || result.data.name !== source.sources.npm) return [];
  return [...new Set([...Object.keys(result.data.dependencies), ...Object.keys(result.data.peerDependencies)])].sort().filter(isPackageName).map((name) => {
    const matches = catalog.technologies.filter((technology) => technology.sources.npm === name);
    const target = matches.length === 1 && matches[0].id !== id ? matches[0] : undefined;
    const runtime = Object.prototype.hasOwnProperty.call(result.data.dependencies, name);
    const peer = Object.prototype.hasOwnProperty.call(result.data.peerDependencies, name);
    const label = runtime && peer ? "Dependency and peer requirement" : peer ? "Peer requirement" : "Runtime dependency";
    const range = [runtime ? result.data.dependencies[name] : null, peer ? result.data.peerDependencies[name] : null].filter(Boolean).join(" / ");
    return { name, targetId: target?.id, label, range, url: `https://www.npmjs.com/package/${name}`,
      edge: target ? { id: `npm:${id}:${target.id}`, source: id, target: target.id, kind: "dependency", directed: true, provenance: "npm",
        explanation: `${label}: ${result.data.name}@${result.data.version} declares ${name} (${range}). npm manifest retrieved ${result.fetchedAt}${result.stale ? "; last known snapshot, refresh unavailable" : ""}.`,
      } satisfies CatalogRelationship : undefined };
  });
}

export function dependencyExpansion(catalog: Catalog, id: string, result: ProviderResult<NpmMetadata>) {
  const edges = dependencyEvidence(catalog, id, result).flatMap(({ edge }) => edge && !catalog.relationships.some((existing) => existing.kind === "dependency" && existing.source === edge.source && existing.target === edge.target && existing.directed) ? [edge] : []);
  return { edges: edges.slice(0, EXPANSION_LIMIT), omitted: Math.max(0, edges.length - EXPANSION_LIMIT) };
}

export function recommendations(catalog: Catalog, id: string) {
  const neighbors = (node: string) => new Set(catalog.relationships.filter((edge) => edge.kind === "ecosystem" && (edge.source === node || edge.target === node)).map((edge) => edge.source === node ? edge.target : edge.source));
  const direct = neighbors(id);
  const selected = catalog.technologies.find((technology) => technology.id === id);
  if (!selected) return [];
  return catalog.technologies.filter((technology) => technology.id !== id).map((technology, order) => {
    const shared = [...neighbors(technology.id)].filter((neighbor) => direct.has(neighbor));
    return { technology, order, score: direct.has(technology.id) ? 1000 : shared.length * 10,
      reason: direct.has(technology.id) ? `Connected to ${selected.name} in the curated ecosystem graph.` : `Shares ${shared.length} ecosystem neighbor${shared.length === 1 ? "" : "s"} with ${selected.name}: ${shared.map((neighbor) => catalog.technologies.find((entry) => entry.id === neighbor)?.name).join(", ")}.` };
  }).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score || a.order - b.order).slice(0, 4);
}

export function activitySignal(result: ProviderResult<GitHubMetadata> | null, now: number) {
  if (!result || result.status !== "ok") return { label: "Unknown", reason: "Repository activity is unavailable." };
  if (result.stale || now - Date.parse(result.fetchedAt) > 15 * 60_000) return { label: "Unknown", reason: "The snapshot is stale; last-known activity is shown below." };
  if (result.data.archived === true) return { label: "Archived", reason: "GitHub marks this repository as archived." };
  const pushed = Date.parse(result.data.pushedAt ?? "");
  if (!Number.isFinite(pushed) || pushed > now) return { label: "Unknown", reason: "No valid last-push timestamp is available." };
  const days = Math.floor((now - pushed) / 86_400_000);
  return { label: days <= 90 ? "Active" : days <= 365 ? "Quiet" : "Low Activity", reason: `Last repository push ${days} days ago. Active: 0-90 days; Quiet: 91-365; Low Activity: over 365. This measures recency, not quality or security.` };
}
