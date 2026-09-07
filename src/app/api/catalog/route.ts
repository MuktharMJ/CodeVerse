import { getCatalog } from "@/services/catalog";
import { createTechnologySearch } from "@/lib/search";

export async function GET(request: Request) {
  const catalog = await getCatalog();
  const query = new URL(request.url).searchParams.get("q");
  return Response.json(query === null ? catalog : { origin: catalog.origin, technologies: createTechnologySearch(catalog.technologies)(query.slice(0, 200)) }, { headers: { "Cache-Control": "no-store" } });
}
