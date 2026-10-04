// MOCK: POST /api/estimate for Milestone 3 local development.
// Milestone 2 (branch milestone-2-engine) owns the real handler; at merge, take theirs and delete
// this file's mock. Request and response shapes follow docs/SPEC.md API contracts.
import { NextResponse } from "next/server";
import { z } from "zod";
import { CURRENT_ROOFS } from "@/lib/api/types";
import { createMockEstimate, toResponse } from "@/lib/estimates/source";

const bodySchema = z.object({
  placeId: z.string().min(1).max(512),
  currentRoof: z.enum(CURRENT_ROOFS).optional(),
  fallback: z
    .object({
      homeSqft: z.number().int().min(400).max(10000),
      stories: z.number().int().min(1).max(3),
      shape: z.enum(["simple", "average", "complex"]),
    })
    .optional(),
});

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_MOCK_ESTIMATES !== "1") {
    return NextResponse.json({ error: "not_implemented" }, { status: 501 });
  }
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const estimate = await createMockEstimate(parsed.data);
  if (!estimate) {
    return NextResponse.json({ error: "address_not_found" }, { status: 422 });
  }
  return NextResponse.json(toResponse(estimate));
}
