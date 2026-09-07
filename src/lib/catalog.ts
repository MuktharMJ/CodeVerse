import type { Catalog } from "../types/catalog";

export function indexCatalog(catalog: Catalog) {
  const technologyById = Object.fromEntries(catalog.technologies.map((technology) => [technology.id, technology]));
  const bySlug = new Map(catalog.technologies.map((technology) => [technology.slug, technology.id]));
  const neighbors = new Map(catalog.technologies.map(({ id }) => [id, new Set<string>()]));
  for (const { source, target } of catalog.relationships) {
    neighbors.get(source)?.add(target);
    neighbors.get(target)?.add(source);
  }
  return { ...catalog, technologyById, connections: catalog.relationships.map(({ source, target }) => [source, target] as const),
    getConnectedIds: (id: string) => [...(neighbors.get(id) ?? [])],
    resolveId: (value: string) => Object.prototype.hasOwnProperty.call(technologyById, value) ? value : bySlug.get(value) ?? null,
  };
}
