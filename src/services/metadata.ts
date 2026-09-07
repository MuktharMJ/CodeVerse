import "server-only";

import { readSnapshot, writeSnapshot } from "@/db/snapshots";
import { getCatalog } from "@/services/catalog";
import type { Catalog, CatalogTechnology } from "@/types/catalog";
import { createMetadataService } from "./metadata-transport";

let current: { signature: string; service: ReturnType<typeof createMetadataService> } | undefined;

export async function getTechnologyMetadata(id: string) {
  const catalog: Catalog = await getCatalog();
  // IDs take precedence if a slug happens to match another technology's ID.
  const technology = catalog.technologies.find((entry) => entry.id === id)
    ?? catalog.technologies.find((entry) => entry.slug === id);
  if (!technology) throw new RangeError("Unknown technology ID");

  const sources: Record<string, CatalogTechnology["sources"]> = Object.fromEntries(
    catalog.technologies.map((entry) => [entry.id, { github: entry.sources.github, npm: entry.sources.npm }]),
  );
  const signature = JSON.stringify(Object.entries(sources).sort(([a], [b]) => a.localeCompare(b)));
  // Keep only the latest catalog's service; source changes cannot reuse old snapshots or grow a service registry.
  if (current?.signature !== signature) {
    current = { signature, service: createMetadataService({
      sources,
      githubToken: process.env.GITHUB_TOKEN,
      snapshotStore: { read: readSnapshot, write: writeSnapshot },
    }) };
  }
  return current.service(technology.id);
}

// Deliberately freshness-aware, for future jobs as well as on-demand requests. No background worker.
export function refreshTechnologyMetadata(id: string) {
  return getTechnologyMetadata(id);
}
