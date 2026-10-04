import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { adminEmail, checkAdmin, isAdminEmail, type AdminCheck } from "@/lib/admin/auth";
import { csvCell, leadsCsv } from "@/lib/admin/csv";
import { handleLeadsExport, handleMarkForwarded } from "@/lib/admin/endpoints";
import { disabledConversions } from "@/lib/openai-ads/capi";
import type { AdminLead, LeadRecord } from "@/lib/server/stores";
import { estimateRecord, m4Setup, T0 } from "@/test/m4";

const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;
const LEAD_ID = "20000000-0000-4000-8000-000000000001";

const lead = (over: Partial<LeadRecord> = {}): LeadRecord => ({
  id: LEAD_ID,
  createdAt: T0.toISOString(),
  estimateId: "00000000-0000-4000-8000-000000000001",
  name: "Pat Example",
  phone: "+16025550123",
  email: "pat@example.com",
  timing: "3_to_12_months",
  address: "100 Example Way, Testville, AZ 85032",
  zip: "85032",
  state: "AZ",
  consentVersion: "manual-2026-10-03",
  consentTextHash: "a".repeat(64),
  consentTs: T0.toISOString(),
  consentCertId: null,
  ip: "203.0.113.7",
  userAgent: "UA",
  pageUrl: null,
  estimateSummary: { squares: 20.4, maxPitch: "8/12", currentRoof: "tile" },
  attribution: { ad_group_id: "ag-1" },
  sessionId: "sess-1",
  optOut: false,
  forwardStatus: "manual_pending",
  forwardedAt: null,
  buyerRef: null,
  duplicateOf: null,
  ...over,
});

const fakeAuth = (email: string | null) =>
  ({ auth: { getUser: async () => (email ? { data: { user: { email } }, error: null } : { data: { user: null }, error: new Error("no session") }) } }) as unknown as SupabaseClient;

describe("admin auth", () => {
  it("allows only ADMIN_EMAIL, defaulting to the owner's address", () => {
    expect(adminEmail(env({}))).toBe("peterkim45366@gmail.com");
    expect(isAdminEmail(" PeterKim45366@gmail.com ", env({}))).toBe(true);
    expect(isAdminEmail("someone@gmail.com", env({}))).toBe(false);
    expect(isAdminEmail(null, env({}))).toBe(false);
    expect(isAdminEmail("ops@example.test", env({ ADMIN_EMAIL: "ops@example.test" }))).toBe(true);
    expect(isAdminEmail("peterkim45366@gmail.com", env({ ADMIN_EMAIL: "ops@example.test" }))).toBe(false);
  });

  it("checkAdmin: unconfigured without a client, unauthenticated without a user, forbidden for other emails", async () => {
    expect(await checkAdmin(null, env({}))).toEqual({ status: "unconfigured" });
    expect(await checkAdmin(fakeAuth(null), env({}))).toEqual({ status: "unauthenticated" });
    expect(await checkAdmin(fakeAuth("intruder@example.com"), env({}))).toEqual({ status: "forbidden" });
    expect(await checkAdmin(fakeAuth("peterkim45366@gmail.com"), env({}))).toEqual({ status: "ok", email: "peterkim45366@gmail.com" });
  });
});

describe("admin routes", () => {
  async function setup() {
    const s = m4Setup();
    await s.estimates.insert(estimateRecord());
    await s.leads.insert(lead());
    return s;
  }
  const as = (check: AdminCheck) => async () => check;

  it("export rejects non-admins and unconfigured auth", async () => {
    const s = await setup();
    for (const [check, status] of [
      [{ status: "unauthenticated" }, 401],
      [{ status: "forbidden" }, 403],
      [{ status: "unconfigured" }, 503],
    ] as [AdminCheck, number][]) {
      const res = await handleLeadsExport({ checkAdmin: as(check), leads: s.leads, now: s.now });
      expect(res.status).toBe(status);
      expect(await res.text()).not.toContain("Pat Example");
    }
  });

  it("export returns the CSV with the lead's confirmed address for the admin", async () => {
    const s = await setup();
    const res = await handleLeadsExport({ checkAdmin: as({ status: "ok", email: "a" }), leads: s.leads, now: s.now });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="leads-2026-10-03.csv"');
    const text = await res.text();
    const [header, row] = text.split("\r\n");
    expect(header.split(",").slice(0, 3)).toEqual(["id", "created_at", "forward_status"]);
    expect(row).toContain("Pat Example,+16025550123,pat@example.com,3–12 months");
    expect(row).toContain('"100 Example Way, Testville, AZ 85032"');
  });

  it("mark forwarded rejects non-admins, cross-site posts and bad IDs", async () => {
    const s = await setup();
    const deps = (check: AdminCheck) => ({ checkAdmin: as(check), leads: s.leads, events: s.events, doNotSell: s.doNotSell, conversions: disabledConversions, now: s.now, siteUrl: "https://example.test" });
    const post = (headers: Record<string, string> = {}, id = LEAD_ID) =>
      handleMarkForwarded(new Request(`https://example.test/api/admin/leads/${id}/forwarded`, { method: "POST", headers, body: "" }), id, deps({ status: "ok", email: "a" }));
    expect((await handleMarkForwarded(new Request("https://example.test/x", { method: "POST" }), LEAD_ID, deps({ status: "forbidden" }))).status).toBe(403);
    expect((await handleMarkForwarded(new Request("https://example.test/x", { method: "POST" }), LEAD_ID, deps({ status: "unauthenticated" }))).status).toBe(401);
    expect((await post({ origin: "https://evil.test" })).status).toBe(403);
    expect((await post({}, "not-a-uuid")).status).toBe(400);
    expect((await s.leads.get(LEAD_ID))?.forwardStatus).toBe("manual_pending");
  });

  it("mark forwarded from the admin form redirects back; JSON returns the new status", async () => {
    const s = await setup();
    const deps = { checkAdmin: as({ status: "ok", email: "a" }), leads: s.leads, events: s.events, doNotSell: s.doNotSell, conversions: disabledConversions, now: s.now, siteUrl: "https://example.test" };
    const form = await handleMarkForwarded(
      new Request(`https://example.test/api/admin/leads/${LEAD_ID}/forwarded`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://example.test" },
        body: "buyerRef=Roofer+A",
      }),
      LEAD_ID,
      deps,
    );
    expect(form.status).toBe(303);
    expect(form.headers.get("location")).toBe("/admin/leads");
    expect(await s.leads.get(LEAD_ID)).toMatchObject({ forwardStatus: "forwarded", forwardedAt: T0.toISOString(), buyerRef: "Roofer A" });
    const again = await handleMarkForwarded(
      new Request(`https://example.test/api/admin/leads/${LEAD_ID}/forwarded`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }),
      LEAD_ID,
      deps,
    );
    expect(await again.json()).toEqual({ ok: true, forwardStatus: "forwarded", forwardedAt: T0.toISOString(), changed: false });
  });
});

describe("CSV escaping", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(csvCell(" padded ")).toBe('" padded "');
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(20.4)).toBe("20.4");
    expect(csvCell(false)).toBe("false");
  });

  it("neutralizes spreadsheet formulas but keeps phone numbers", () => {
    expect(csvCell("=HYPERLINK(\"http://x\")")).toBe("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(csvCell("+SUM(A1)")).toBe("'+SUM(A1)");
    expect(csvCell("-2+3")).toBe("'-2+3");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell("+16025550123")).toBe("+16025550123");
    expect(csvCell("-5")).toBe("-5");
  });

  it("escapes hostile lead fields in the export", () => {
    const hostile: AdminLead = lead({ name: '=cmd|" /C calc"!A0', email: "x@y.z", address: "1 Main St, Apt 2\nTown" });
    const [, row] = leadsCsv([hostile]).split("\r\n");
    expect(row).toContain("\"'=cmd|\"\" /C calc\"\"!A0\"");
    expect(row).toContain('"1 Main St, Apt 2\nTown"');
  });
});
