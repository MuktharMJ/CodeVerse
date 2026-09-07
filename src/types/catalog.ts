import type { Relationship, Technology } from "../data/technologies";

export interface CatalogTechnology extends Technology {
  slug: string;
  aliases: readonly string[];
  sources: { github?: string; npm?: string; githubNote?: string; npmNote?: string };
}

export interface CatalogRelationship extends Relationship {
  id: string;
  weight?: number;
  explanation?: string;
}

export interface Catalog {
  technologies: CatalogTechnology[];
  relationships: CatalogRelationship[];
  origin: "database" | "local";
  stale?: boolean;
}
