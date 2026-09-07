import postgres, { type Sql } from "postgres";

let database: Sql | undefined;

// Callers in the application must enforce their own server-only boundary.
export function getSql(): Sql | null {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;
  database ??= postgres(url, {
    max: 5,
    connect_timeout: 2,
    idle_timeout: 20,
    connection: { statement_timeout: 3000 },
  });
  return database;
}

export async function closeDatabase(): Promise<void> {
  const sql = database;
  database = undefined;
  await sql?.end({ timeout: 2 });
}
