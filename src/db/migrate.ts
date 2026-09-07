import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Sql } from "postgres";
import { getSql } from "./client";

export async function migrateDatabase(
  sql: Sql | null = getSql(),
  directory: string = resolve(process.cwd(), "migrations"),
): Promise<void> {
  if (!sql) throw new Error("Database is not configured");
  const filenames = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
  if (!filenames.length) throw new Error("No database migrations found");
  const versions = new Set<string>();
  const migrations = await Promise.all(filenames.map(async (name) => {
    const match = /^(\d{4})_[a-z0-9_]+\.sql$/.exec(name);
    if (!match || versions.has(match[1])) throw new Error(`Invalid or duplicate migration version: ${name}`);
    versions.add(match[1]);
    const content = (await readFile(resolve(directory, name), "utf8")).replace(/\r\n/g, "\n");
    return { version: match[1], name, content, checksum: createHash("sha256").update(content).digest("hex") };
  }));

  await sql.begin(async (transaction) => {
    // Transaction-scoped lock also covers the first creation of the ledger.
    await transaction`SELECT pg_advisory_xact_lock(1129270853, 1296648018)`;
    await transaction`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version text PRIMARY KEY,
        name text NOT NULL,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    const applied = await transaction<{ version: string; name: string; checksum: string }[]>`
      SELECT version, name, checksum FROM schema_migrations ORDER BY version
    `;
    for (const row of applied) {
      const migration = migrations.find(({ version }) => version === row.version);
      if (!migration || migration.name !== row.name || migration.checksum !== row.checksum) {
        throw new Error(`Migration checksum mismatch or missing migration: ${row.version}`);
      }
    }
    const latest = applied.at(-1)?.version;
    for (const migration of migrations) {
      if (applied.some(({ version }) => version === migration.version)) continue;
      if (latest && migration.version < latest) throw new Error(`Out-of-order migration: ${migration.name}`);
      // Only trusted, versioned local SQL files are executed as raw SQL.
      await transaction.unsafe(migration.content).simple();
      await transaction`
        INSERT INTO schema_migrations (version, name, checksum)
        VALUES (${migration.version}, ${migration.name}, ${migration.checksum})
      `;
    }
  });
}
