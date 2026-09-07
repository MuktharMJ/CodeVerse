"use client";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Catalog } from "@/types/catalog";
import { indexCatalog } from "@/lib/catalog";
import { createTechnologySearch } from "@/lib/search";

const CatalogContext = createContext<(ReturnType<typeof indexCatalog> & { search: ReturnType<typeof createTechnologySearch> }) | null>(null);
export function CatalogProvider({ catalog, children }: { catalog: Catalog; children: ReactNode }) {
  const value = useMemo(() => ({ ...indexCatalog(catalog), search: createTechnologySearch(catalog.technologies) }), [catalog]);
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}
export function useCatalog() {
  const catalog = useContext(CatalogContext);
  if (!catalog) throw new Error("CatalogProvider is required");
  return catalog;
}
