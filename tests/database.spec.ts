// Run with: npx tsx --test tests/database.spec.ts
// TEST_DATABASE_URL must point to a disposable DB whose user can create schemas.
// This suite never uses DATABASE_URL and never migrates or seeds public.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import postgres, { type Sql } from "postgres";
import { localCatalog } from "../src/data/local-catalog";
import { readDatabaseCatalog } from "../src/db/catalog";
import { migrateDatabase } from "../src/db/migrate";
import { seedDatabase } from "../src/db/seed";
import { readSnapshot, writeSnapshot, type SuccessfulSnapshot } from "../src/db/snapshots";

const directory = resolve(process.cwd(), "migrations");
const testUrl = process.env.TEST_DATABASE_URL?.trim();

// Playwright also discovers *.spec.ts; register only under the Node test runner.
if (process.env.NODE_TEST_CONTEXT) test("unconfigured database has explicit catalog and snapshot behavior", async () => {
  await assert.rejects(readDatabaseCatalog(null), /not configured/);
  assert.equal(await readSnapshot("react", "github", "react/react", null), null);
  await assert.rejects(migrateDatabase(null), /not configured/);
  await assert.rejects(seedDatabase(null), /not configured/);
  await assert.rejects(writeSnapshot("react", "github", "react/react", {
    status: "ok", fetchedAt: "2026-09-07T12:00:00.000Z", data: {},
  }, null), /not configured/);
});

if (process.env.NODE_TEST_CONTEXT) test("PostgreSQL catalog, migrations, and snapshots", { skip: !testUrl, timeout: 60_000 }, async (t) => {
  const schema = `codeverse_test_${randomUUID().replaceAll("-", "")}`;
  const admin = postgres(testUrl!, { max: 1, connect_timeout: 2, idle_timeout: 20,
    connection: { statement_timeout: 3000 }, onnotice: () => {} });
  let sql: Sql | undefined;
  let created = false;
  try {
    await admin`CREATE SCHEMA ${admin(schema)}`;
    created = true;
    const isolatedUrl = new URL(testUrl!);
    // postgres.js gives URL parameters precedence over connection options.
    isolatedUrl.searchParams.delete("options");
    isolatedUrl.searchParams.delete("search_path");
    isolatedUrl.searchParams.delete("statement_timeout");
    const db = postgres(isolatedUrl.toString(), { max: 5, connect_timeout: 2, idle_timeout: 20,
      connection: { search_path: schema, statement_timeout: 3000 }, onnotice: () => {} });
    sql = db;
    assert.equal((await db`SELECT current_schema() AS schema`)[0].schema, schema);

    await t.test("migrations serialize, run twice, and detect changed checksums", async () => {
      await Promise.all([migrateDatabase(db, directory), migrateDatabase(db, directory)]);
      const rows = await db`SELECT version, checksum FROM schema_migrations ORDER BY version`;
      assert.equal(rows.length, 2);
      const content = (await readFile(resolve(directory, "0001_catalog.sql"), "utf8"))
        .replace(/\r\n/g, "\n");
      assert.equal(rows[0].checksum, createHash("sha256").update(content).digest("hex"));
      await db`UPDATE schema_migrations SET checksum = 'changed' WHERE version = '0001'`;
      await assert.rejects(migrateDatabase(db, directory), /checksum mismatch/);
      await db`UPDATE schema_migrations SET checksum = ${rows[0].checksum} WHERE version = '0001'`;
      await migrateDatabase(db, directory);
      await assert.rejects(readDatabaseCatalog(db), /empty/);
    });

    await t.test("seeding twice preserves all 17 technologies and 29 relationships in order", async () => {
      await seedDatabase(db);
      await seedDatabase(db);
      const catalog = await readDatabaseCatalog(db);
      assert.equal(catalog.technologies.length, 17);
      assert.equal(catalog.relationships.length, 29);
      assert.deepEqual(catalog, { ...localCatalog, origin: "database" });
      assert.equal((await db`SELECT count(*)::integer AS count FROM snapshots`)[0].count, 0);
    });

    await t.test("database edits, aliases, mappings, and timestamps survive reseeding", async () => {
      const [before] = await db`SELECT updated_at FROM technologies WHERE id = 'react'`;
      await db`
        UPDATE technologies SET name = 'Curated React', aliases = ARRAY['curated', 'ui'],
          sources = '{"github":"facebook/react","npm":"react","githubNote":"Curated source"}'::jsonb
        WHERE id = 'react'
      `;
      await db`UPDATE relationships SET weight = 0.8, explanation = 'Curated explanation' WHERE id = ${localCatalog.relationships[0].id}`;
      await seedDatabase(db);
      const catalog = await readDatabaseCatalog(db);
      assert.equal(catalog.technologies[0].name, "Curated React");
      assert.deepEqual(catalog.technologies[0].aliases, ["curated", "ui"]);
      assert.deepEqual(catalog.technologies[0].sources, {
        github: "facebook/react", npm: "react", githubNote: "Curated source",
      });
      assert.equal(catalog.relationships[0].weight, 0.8);
      assert.equal(catalog.relationships[0].explanation, "Curated explanation");
      const [after] = await db`SELECT updated_at FROM technologies WHERE id = 'react'`;
      assert.ok(after.updated_at.getTime() > before.updated_at.getTime());
    });

    await t.test("stable ID ordering breaks order ties", async () => {
      await db`UPDATE technologies SET "order" = -1 WHERE id IN ('vue', 'react')`;
      const catalog = await readDatabaseCatalog(db);
      assert.deepEqual(catalog.technologies.slice(0, 2).map(({ id }) => id), ["react", "vue"]);
    });

    await t.test("unique slugs, edge uniqueness, foreign keys, and self links are enforced", async () => {
      await assert.rejects(db`UPDATE technologies SET slug = 'react' WHERE id = 'vue'`, { code: "23505" });
      await assert.rejects(db`
        INSERT INTO relationships (id, source, target, kind, provenance, directed)
        VALUES ('reverse-duplicate', 'nextjs', 'react', 'ecosystem', 'curated', false)
      `, { code: "23505" });
      await assert.rejects(db`
        INSERT INTO relationships (id, source, target, kind, provenance, directed)
        VALUES ('missing-source', 'missing', 'react', 'dependency', 'npm', true)
      `, { code: "23503" });
      await assert.rejects(db`
        INSERT INTO relationships (id, source, target, kind, provenance, directed)
        VALUES ('missing-target', 'react', 'missing', 'dependency', 'npm', true)
      `, { code: "23503" });
      await assert.rejects(db`
        INSERT INTO relationships (id, source, target, kind, provenance, directed)
        VALUES ('self', 'react', 'react', 'dependency', 'npm', true)
      `, { code: "23514" });
      await db`
        INSERT INTO relationships (id, source, target, kind, provenance, directed) VALUES
        ('forward-directed', 'react', 'nextjs', 'dependency', 'npm', true),
        ('reverse-directed', 'nextjs', 'react', 'dependency', 'npm', true)
      `;
      await assert.rejects(db`DELETE FROM technologies WHERE id = 'react'`, { code: "23503" });
    });

    await t.test("category, finite geometry, size, weights, and mapping shape are constrained", async () => {
      await assert.rejects(db`UPDATE technologies SET aliases = ARRAY[NULL]::text[] WHERE id = 'react'`, { code: "23514" });
      await assert.rejects(db`UPDATE technologies SET aliases = ARRAY[['nested']]::text[] WHERE id = 'react'`);
      await assert.rejects(db`UPDATE technologies SET slug = 'constructor' WHERE id = 'react'`, { code: "23514" });
      await assert.rejects(db`UPDATE technologies SET category = 'Unknown' WHERE id = 'react'`, { code: "23514" });
      for (const position of ["{}", "{1,2}", "{1,2,3,4}", "{1,NULL,3}", "{1,NaN,3}",
        "{1,Infinity,3}", "{1,-Infinity,3}", "{{1,2,3}}", "[0:2]={1,2,3}"]) {
        await assert.rejects(db`UPDATE technologies SET position = ${position}::double precision[] WHERE id = 'react'`, { code: "23514" });
      }
      for (const size of ["0", "-1", "NaN", "Infinity"]) {
        await assert.rejects(db`UPDATE technologies SET size = ${size}::double precision WHERE id = 'react'`, { code: "23514" });
      }
      for (const weight of ["-0.1", "1.1", "NaN", "Infinity"]) {
        await assert.rejects(db`UPDATE relationships SET weight = ${weight}::double precision`, { code: "23514" });
      }
      for (const sources of ['[]', '{"github":null}', '{"github":123}', '{"url":"https://example.com"}']) {
        await assert.rejects(db`UPDATE technologies SET sources = ${sources}::jsonb WHERE id = 'react'`, { code: "23514" });
      }
    });

    await t.test("reads reject unsafe source strings", async () => {
      await db`UPDATE technologies SET slug = 'renamed-react' WHERE id = 'react'`;
      await db`UPDATE technologies SET slug = 'react' WHERE id = 'vue'`;
      await assert.rejects(readDatabaseCatalog(db), /ambiguous technology identity/);
      await db`UPDATE technologies SET slug = 'vue' WHERE id = 'vue'`;
      await db`UPDATE technologies SET slug = 'react' WHERE id = 'react'`;
      for (const sources of [
        { github: "https://example.com/evil" }, { github: "owner/../repo" },
        { github: "owner/repo?token=secret" }, { npm: "../../evil" },
        { npm: "@scope/pkg#fragment" }, { npm: "https://registry.npmjs.org/react" },
      ]) {
        await db`UPDATE technologies SET sources = ${db.json(sources)} WHERE id = 'react'`;
        await assert.rejects(readDatabaseCatalog(db), /Invalid database .* source/);
      }
      await db`UPDATE technologies SET sources = '{"github":"react/react","npm":"@scope/package"}'::jsonb WHERE id = 'react'`;
      assert.equal((await readDatabaseCatalog(db)).technologies[0].sources.npm, "@scope/package");
    });

    await t.test("snapshots preserve payload, timestamp, source key, and newest success", async () => {
      const result: SuccessfulSnapshot = { status: "ok", fetchedAt: "2026-09-07T12:00:00.123Z",
        data: { repository: "react/react", stars: 123, language: null } };
      assert.equal(await readSnapshot("react", "github", "react/react", db), null);
      await writeSnapshot("react", "github", "react/react", result, db);
      assert.deepEqual(await readSnapshot("react", "github", "react/react", db), result);
      assert.equal(await readSnapshot("react", "github", "facebook/react", db), null);
      assert.equal(await readSnapshot("react", "npm", "react/react", db), null);
      assert.equal(await readSnapshot("vue", "github", "react/react", db), null);
      await writeSnapshot("react", "github", "react/react", {
        ...result, fetchedAt: "2026-09-06T12:00:00.000Z", data: { stars: 1 },
      }, db);
      assert.deepEqual(await readSnapshot("react", "github", "react/react", db), result);
      const newer = { ...result, fetchedAt: "2026-09-08T12:00:00.000Z", data: { stars: 456 } };
      await writeSnapshot("react", "github", "react/react", newer, db);
      await writeSnapshot("react", "github", "facebook/react", result, db);
      assert.deepEqual(await readSnapshot("react", "github", "react/react", db), newer);
      assert.deepEqual(await readSnapshot("react", "github", "facebook/react", db), result);
      assert.equal((await db`SELECT count(*)::integer AS count FROM snapshots`)[0].count, 2);
      await assert.rejects(writeSnapshot("missing", "github", "react/react", result, db), { code: "23503" });
      await assert.rejects(writeSnapshot("react", "github", "react/react", {
        status: "unavailable", message: "failure",
      } as unknown as SuccessfulSnapshot, db), /Only successful/);
      await assert.rejects(writeSnapshot("react", "github", "react/react", {
        ...result, fetchedAt: "invalid",
      }, db), /Only successful/);
      await assert.rejects(db`UPDATE snapshots SET provider = 'other'`, { code: "23514" });
      assert.deepEqual(await readSnapshot("react", "github", "react/react", db), newer);
    });
  } finally {
    try {
      await sql?.end({ timeout: 2 });
    } finally {
      try {
        if (created) await admin`DROP SCHEMA ${admin(schema)} CASCADE`;
      } finally {
        await admin.end({ timeout: 2 });
      }
    }
  }
});
