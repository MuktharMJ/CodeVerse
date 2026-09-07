import { loadEnvConfig } from "@next/env";
import { closeDatabase } from "../src/db/client";
import { migrateDatabase } from "../src/db/migrate";
import { seedDatabase } from "../src/db/seed";

async function main(): Promise<void> {
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
  try {
    const command = process.argv[2];
    if (command === "migrate") await migrateDatabase();
    else if (command === "seed") await seedDatabase();
    else throw new Error("Usage: tsx scripts/db.ts <migrate|seed>");
    console.log(`Database ${command} complete.`);
  } finally {
    await closeDatabase();
  }
}

void main().catch(() => {
  // Connection errors can contain credentials or hosts; do not print raw errors.
  console.error("Database command failed. Use migrate or seed; check DATABASE_URL, connectivity, and migration checksums.");
  process.exitCode = 1;
});
