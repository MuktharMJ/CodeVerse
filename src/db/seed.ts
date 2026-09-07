import type { Sql } from "postgres";
import { localCatalog } from "../data/local-catalog";
import { getSql } from "./client";

export async function seedDatabase(sql: Sql | null = getSql()): Promise<void> {
  if (!sql) throw new Error("Database is not configured");
  await sql.begin(async (transaction) => {
    for (const [order, technology] of localCatalog.technologies.entries()) {
      await transaction`
        INSERT INTO technologies (id, slug, category, name, description, detail, aliases, symbol, position, size, "order", sources)
        VALUES (${technology.id}, ${technology.slug}, ${technology.category}, ${technology.name},
          ${technology.description}, ${technology.detail}, ${transaction.array([...technology.aliases], 25)},
          ${technology.symbol}, ${transaction.array(technology.position, 701)}, ${technology.size},
          ${order}, ${transaction.json(technology.sources)})
        ON CONFLICT DO NOTHING
      `;
    }
    for (const [order, relationship] of localCatalog.relationships.entries()) {
      await transaction`
        INSERT INTO relationships (id, source, target, kind, provenance, directed, weight, explanation, "order")
        VALUES (${relationship.id}, ${relationship.source}, ${relationship.target}, ${relationship.kind},
          ${relationship.provenance}, ${relationship.directed}, ${relationship.weight ?? null},
          ${relationship.explanation ?? null}, ${order})
        ON CONFLICT DO NOTHING
      `;
    }
  });
}
