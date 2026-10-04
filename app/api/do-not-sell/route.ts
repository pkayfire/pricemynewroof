// STUB: POST /api/do-not-sell records a California "Do not sell or share" request.
// Validates only; persistence and fulfillment are Milestone 4. Until then nothing is stored,
// so this must not ship to production as is.
import { NextResponse } from "next/server";
import { doNotSellSchema } from "@/lib/legal/do-not-sell";

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const parsed = doNotSellSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
