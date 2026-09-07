import { technologies, relationships } from "./technologies";
import { technologySources, hasTechnologySource } from "./technology-sources";
import { aliases } from "../lib/search";
import type { Catalog } from "../types/catalog";

// The original universe remains the seed and the offline safety net.
export const localCatalog: Catalog = {
  origin: "local",
  technologies: technologies.map((technology) => ({ ...technology, slug: technology.id, aliases: aliases[technology.id] ?? [], sources: hasTechnologySource(technology.id) ? technologySources[technology.id] : {} })),
  relationships: relationships.map((relationship) => ({ ...relationship, id: `${relationship.source}:${relationship.target}:${relationship.kind}`, explanation: "Curated ecosystem pairing: these technologies share tooling, workflows, or a problem domain. This is not a package dependency." })),
};
