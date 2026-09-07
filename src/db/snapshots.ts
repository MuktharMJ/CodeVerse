import type { Sql } from "postgres";
import type { ProviderResult } from "../types/metadata";
import { getSql } from "./client";

export type SnapshotProvider = "github" | "npm";
export type SuccessfulSnapshot = Extract<ProviderResult<unknown>, { status: "ok" }>;

export async function readSnapshot(
  technologyId: string,
  provider: SnapshotProvider,
  sourceKey: string,
  sql: Sql | null = getSql(),
): Promise<ProviderResult<unknown> | null> {
  if (!sql) return null;
  const [snapshot] = await sql<{ payload: unknown; fetched_at: Date }[]>`
    SELECT payload, fetched_at FROM snapshots
    WHERE technology_id = ${technologyId} AND provider = ${provider} AND source_key = ${sourceKey}
  `;
  return snapshot
    ? { status: "ok", data: snapshot.payload, fetchedAt: snapshot.fetched_at.toISOString() }
    : null;
}

export async function writeSnapshot(
  technologyId: string,
  provider: SnapshotProvider,
  sourceKey: string,
  result: SuccessfulSnapshot,
  sql: Sql | null = getSql(),
): Promise<void> {
  if (!sql) throw new Error("Database is not configured");
  if (result.status !== "ok" || !Number.isFinite(Date.parse(result.fetchedAt))) {
    throw new Error("Only successful, timestamped snapshots can be stored");
  }
  const payload = JSON.stringify(result.data);
  if (payload === undefined) throw new Error("Snapshot payload must be JSON");
  await sql`
    INSERT INTO snapshots (technology_id, provider, source_key, payload, fetched_at)
    VALUES (${technologyId}, ${provider}, ${sourceKey}, ${sql.json(JSON.parse(payload))}, ${result.fetchedAt}::timestamptz)
    ON CONFLICT (technology_id, provider, source_key) DO UPDATE
    SET payload = EXCLUDED.payload, fetched_at = EXCLUDED.fetched_at
    WHERE EXCLUDED.fetched_at > snapshots.fetched_at
  `;
}
