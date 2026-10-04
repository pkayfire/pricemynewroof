// HTTP layer for GET /api/coverage?zip=, separate from the route file so tests can inject a provider.
import { zipSchema } from "@/lib/api/contracts";
import type { CoverageProvider } from "./index";

export async function handleCoverageGet(request: Request, provider: CoverageProvider): Promise<Response> {
  const zip = zipSchema.safeParse(new URL(request.url).searchParams.get("zip") ?? "");
  if (!zip.success) {
    return Response.json({ error: "invalid_request", message: "zip must be a 5-digit ZIP code.", field: "zip" }, { status: 400 });
  }
  const body = await provider.forZip(zip.data);
  return Response.json(body, { headers: { "cache-control": "public, max-age=300" } });
}
