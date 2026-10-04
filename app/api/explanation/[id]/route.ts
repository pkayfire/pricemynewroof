// GET /api/explanation/:estimateId → { text, source } (docs/SPEC.md "Explanation service").
import { NextResponse } from "next/server";
import type { ExplanationResponse } from "@/lib/api/types";
import { getStoredEstimate, isExpired } from "@/lib/estimates/source";
import { getExplanation } from "@/lib/explanation/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const estimate = await getStoredEstimate(id);
  if (!estimate || !estimate.drivers || isExpired(estimate)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const result = await getExplanation(estimate.drivers);
  const body: ExplanationResponse = { text: result.text, source: result.source };
  return NextResponse.json(body, { headers: { "cache-control": "private, no-store" } });
}
