"use client";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Catalog, CatalogRelationship } from "@/types/catalog";
import { indexCatalog } from "@/lib/catalog";
import { createTechnologySearch } from "@/lib/search";

type Expansion = { source: string; edges: CatalogRelationship[] } | null;
const CatalogContext = createContext<(ReturnType<typeof indexCatalog> & { search: ReturnType<typeof createTechnologySearch>; baseCatalog: Catalog; expansion: Expansion; setExpansion: (value: Expansion) => void }) | null>(null);
export function CatalogProvider({ catalog, children }: { catalog: Catalog; children: ReactNode }) {
  const [expansion, setExpansion] = useState<Expansion>(null);
  useEffect(() => {
    const reset = () => setExpansion(null);
    window.addEventListener("popstate", reset);
    window.addEventListener("codeverse:navigation", reset);
    return () => { window.removeEventListener("popstate", reset); window.removeEventListener("codeverse:navigation", reset); };
  }, []);
  const base = useMemo(() => ({ ...indexCatalog(catalog), search: createTechnologySearch(catalog.technologies) }), [catalog]);
  const value = useMemo(() => {
    const graph = expansion ? indexCatalog({ ...catalog, relationships: [...catalog.relationships, ...expansion.edges] }) : base;
    // Keep identity and search indexes stable: changing edges must not refocus the camera.
    return { ...base, relationships: graph.relationships, connections: graph.connections, getConnectedIds: graph.getConnectedIds, baseCatalog: catalog, expansion, setExpansion };
  }, [base, catalog, expansion]);
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}
export function useCatalog() {
  const catalog = useContext(CatalogContext);
  if (!catalog) throw new Error("CatalogProvider is required");
  return catalog;
}
