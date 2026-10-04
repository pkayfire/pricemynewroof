// /admin/leads: pending and forwarded leads from the leads table, with CSV export. Admin only.
import { redirect } from "next/navigation";
import { TIMING_OPTIONS } from "@/lib/api/contracts";
import { ADMIN_LEAD_LIMIT } from "@/lib/admin/endpoints";
import { currentAdmin } from "@/lib/admin/session";
import { getLeadStore } from "@/lib/server/deps";
import type { AdminLead } from "@/lib/server/stores";
import { signOut } from "../actions";

export const dynamic = "force-dynamic";

const timing = (t: string) => TIMING_OPTIONS.find((o) => o.id === t)?.label ?? t;
const when = (iso: string | null) => (iso ? `${iso.slice(0, 16).replace("T", " ")} UTC` : "");

function LeadTable({ leads, showAction }: { leads: AdminLead[]; showAction: boolean }) {
  if (leads.length === 0) return <p>None.</p>;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 15 }}>
        <thead>
          <tr style={{ textAlign: "left" }}>
            <th>Received</th>
            <th>Contact</th>
            <th>Timing</th>
            <th>Address</th>
            <th>Roof</th>
            <th>Source</th>
            <th>Status</th>
            {showAction ? <th>Forward</th> : null}
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => (
            <tr key={l.id} style={{ borderTop: "1px solid #E1E5E7", verticalAlign: "top" }}>
              <td>{when(l.createdAt)}</td>
              <td>
                {l.name}
                <br />
                <a href={`tel:${l.phone}`}>{l.phone}</a>
                <br />
                <a href={`mailto:${l.email}`}>{l.email}</a>
              </td>
              <td>{timing(l.timing)}</td>
              <td>{l.address}</td>
              <td>
                {l.estimateSummary?.squares != null ? `${l.estimateSummary.squares} squares` : "Size unknown"}
                {l.estimateSummary?.maxPitch ? `, max pitch ${l.estimateSummary.maxPitch}` : ""}
                {l.estimateSummary?.currentRoof ? `, now ${l.estimateSummary.currentRoof.replace("_", " ")}` : ""}
                <br />
                <a href={`/estimate/${l.estimateId}`}>Estimate</a>
              </td>
              <td>{l.attribution.ad_group_id ? `Ad group ${l.attribution.ad_group_id}` : l.attribution.utm_source ?? "Direct"}</td>
              <td>
                {l.forwardStatus.replace("_", " ")}
                {l.forwardedAt ? <><br />{when(l.forwardedAt)}</> : null}
                {l.buyerRef ? <><br />Ref {l.buyerRef}</> : null}
                {l.duplicateOf ? <><br />Duplicate of {l.duplicateOf.slice(0, 8)}</> : null}
              </td>
              {showAction ? (
                <td>
                  <form method="post" action={`/api/admin/leads/${l.id}/forwarded`} style={{ display: "grid", gap: 6 }}>
                    <label>
                      Roofer or reference (optional)
                      <br />
                      <input name="buyerRef" maxLength={200} style={{ minHeight: 44 }} />
                    </label>
                    <button type="submit" style={{ minHeight: 44 }}>
                      Mark forwarded
                    </button>
                  </form>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function AdminLeads() {
  const admin = await currentAdmin();
  if (admin.status === "unconfigured") {
    return (
      <>
        <h1>Leads</h1>
        <p>Admin sign-in isn&apos;t configured. Set NEXT_PUBLIC_SUPABASE_ANON_KEY to enable it.</p>
      </>
    );
  }
  if (admin.status === "unauthenticated") redirect("/admin/login");
  if (admin.status === "forbidden") {
    return (
      <>
        <h1>Leads</h1>
        <p>This account isn&apos;t allowed to view leads.</p>
        <form action={signOut}>
          <button type="submit">Sign out</button>
        </form>
      </>
    );
  }

  const leads = await getLeadStore().list(ADMIN_LEAD_LIMIT);
  const pending = leads.filter((l) => l.forwardStatus === "manual_pending" || l.forwardStatus === "failed" || l.forwardStatus === "queued");
  const forwarded = leads.filter((l) => l.forwardStatus === "forwarded");
  const other = leads.filter((l) => l.forwardStatus === "duplicate" || l.forwardStatus === "held");

  return (
    <>
      <div style={{ display: "flex", gap: 16, alignItems: "baseline", flexWrap: "wrap" }}>
        <h1 style={{ marginRight: "auto" }}>Leads</h1>
        <a href="/api/admin/leads/export">Download CSV</a>
        <form action={signOut}>
          <button type="submit">Sign out</button>
        </form>
      </div>
      <p>Signed in as {admin.email}. Forward each pending request to a local roofer within one business day, then mark it forwarded.</p>
      <h2>Pending ({pending.length})</h2>
      <LeadTable leads={pending} showAction />
      <h2>Forwarded ({forwarded.length})</h2>
      <LeadTable leads={forwarded} showAction={false} />
      <h2>Duplicates and held ({other.length})</h2>
      <p>Duplicates are the same phone within 30 days and are not forwarded again. Held leads come from development mode.</p>
      <LeadTable leads={other} showAction />
    </>
  );
}
