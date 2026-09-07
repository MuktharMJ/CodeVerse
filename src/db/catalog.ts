import type { Sql } from "postgres";
import type { Catalog, CatalogRelationship, CatalogTechnology } from "../types/catalog";
import { getSql } from "./client";

type TechnologyRow = Omit<CatalogTechnology, "sources"> & { sources: unknown };
type RelationshipRow = Omit<CatalogRelationship, "weight" | "explanation"> & {
  weight: number | null;
  explanation: string | null;
};

export async function readDatabaseCatalog(sql: Sql | null = getSql()): Promise<Catalog> {
  if (!sql) throw new Error("Database is not configured");
  return sql.begin("isolation level repeatable read read only", async (transaction) => {
    const technologies = await transaction<TechnologyRow[]>`
      SELECT id, slug, category, name, description, detail, aliases, symbol, position, size, sources
      FROM technologies ORDER BY "order", id
    `;
    const relationships = await transaction<RelationshipRow[]>`
      SELECT id, source, target, kind, provenance, directed, weight, explanation
      FROM relationships ORDER BY "order", id
    `;
    if (!technologies.length) throw new Error("Database catalog is empty");
    const ids = new Set(technologies.map(({ id }) => id));
    for (const technology of technologies) {
      if (!/^[a-z0-9][a-z0-9-]*$/.test(technology.id) || !/^[a-z0-9][a-z0-9-]*$/.test(technology.slug) ||
        ["constructor", "prototype"].includes(technology.id) || ["constructor", "prototype"].includes(technology.slug) ||
        (technology.slug !== technology.id && ids.has(technology.slug)) ||
        !Array.isArray(technology.aliases) || !technology.aliases.every((alias) => typeof alias === "string")) {
        throw new Error("Invalid or ambiguous technology identity");
      }
    }

    return {
      origin: "database",
      technologies: technologies.map(({ sources: value, ...technology }) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          throw new Error("Invalid database source mappings");
        }
        const sources: CatalogTechnology["sources"] = {};
        for (const [key, entry] of Object.entries(value)) {
          if (typeof entry !== "string") throw new Error("Invalid database source mapping");
          if (key === "github") {
            if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_][A-Za-z0-9_.-]{0,99}$/.test(entry)) {
              throw new Error("Invalid database GitHub source");
            }
            sources.github = entry;
          } else if (key === "npm") {
            if (entry.length > 214 || !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(entry)) {
              throw new Error("Invalid database npm source");
            }
            sources.npm = entry;
          } else if (key === "githubNote" || key === "npmNote") {
            sources[key] = entry;
          } else {
            throw new Error("Unknown database source mapping");
          }
        }
        return { ...technology, sources };
      }),
      relationships: relationships.map(({ weight, explanation, ...relationship }) => ({
        ...relationship,
        ...(weight === null ? {} : { weight }),
        ...(explanation === null ? {} : { explanation }),
      })),
    };
  });
}
