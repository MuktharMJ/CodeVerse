import { UniverseExplorer } from "@/components/universe-explorer";
import { CatalogProvider } from "@/components/catalog-provider";
import { getCatalog } from "@/services/catalog";

export const dynamic = "force-dynamic";
export default async function Home() {
  const catalog = await getCatalog();
  return <CatalogProvider catalog={catalog}><UniverseExplorer /></CatalogProvider>;
}
