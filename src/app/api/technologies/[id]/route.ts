import { getTechnologyMetadata } from "@/services/metadata";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const metadata = await getTechnologyMetadata(id);
    const complete = metadata.github.status === "ok" && !metadata.github.stale && metadata.npm.status === "ok" && !metadata.npm.stale;
    return Response.json(metadata, { headers: { "Cache-Control": complete ? "public, max-age=60" : "no-store" } });
  } catch (error) {
    if (!(error instanceof RangeError)) return Response.json({ message: "Metadata is temporarily unavailable." }, { status: 503 });
    return Response.json({ message: "Unknown technology ID." }, {
      status: 404, headers: { "Cache-Control": "no-store" },
    });
  }

}
