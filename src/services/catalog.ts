import "server-only";
import { readDatabaseCatalog } from "@/db/catalog";
import { localCatalog } from "@/data/local-catalog";
import type { Catalog } from "@/types/catalog";
import { closeDatabase } from "@/db/client";

// One deliberate read per page/API request; concurrent requests share the same read.
let pending: Promise<Catalog> | undefined;
let lastKnown: Catalog | undefined;
export function getCatalog(): Promise<Catalog> {
  if (!pending) {
    let timer: ReturnType<typeof setTimeout>;
    const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { void closeDatabase(); reject(new Error("Catalog read timed out")); }, 4000); });
    pending = Promise.race([readDatabaseCatalog(), deadline])
      .then((catalog) => { lastKnown = catalog; return catalog; })
      .catch(() => lastKnown ? { ...lastKnown, stale: true } : localCatalog)
      .finally(() => { clearTimeout(timer); pending = undefined; });
  }
  return pending;
}
