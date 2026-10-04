// STUB: POST /api/email-estimate { estimateId, email, notifyWhenCovered } → { ok }.
// Validates only. Saving to `email_signups` and sending the email are Milestone 4; until then
// nothing is stored or sent, so this must not ship to production as is.
import { NextResponse } from "next/server";
import { z } from "zod";
import { getStoredEstimate } from "@/lib/estimates/source";

const bodySchema = z.object({
  estimateId: z.string().min(1).max(200),
  email: z.string().trim().max(254).email(),
  notifyWhenCovered: z.boolean(),
});

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  if (!(await getStoredEstimate(parsed.data.estimateId))) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
