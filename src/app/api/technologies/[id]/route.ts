import { hasTechnologySource } from "@/data/technology-sources";
import { getTechnologyMetadata } from "@/services/metadata";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!hasTechnologySource(id)) {
    return Response.json({ message: "Unknown technology ID." }, {
      status: 404, headers: { "Cache-Control": "no-store" },
    });
  }

  const metadata = await getTechnologyMetadata(id);
  const complete = metadata.github.status === "ok" && metadata.npm.status === "ok";
  return Response.json(metadata, {
    headers: { "Cache-Control": complete ? "public, max-age=60" : "no-store" },
  });
}
