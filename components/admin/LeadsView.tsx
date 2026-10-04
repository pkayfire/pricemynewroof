// The admin leads view (pending, forwarded, duplicates and held). Server component.
import { TIMING_OPTIONS } from "@/lib/api/contracts";
import type { AdminLead } from "@/lib/server/stores";
import { signOut } from "@/app/admin/actions";
import { ADMIN_TIME_ZONE } from "@/lib/site/config";

const timing = (t: string) => TIMING_OPTIONS.find((o) => o.id === t)?.label ?? t;
const WHEN = new Intl.DateTimeFormat("en-US", {
  timeZone: ADMIN_TIME_ZONE,
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});
const when = (iso: string | null) => (iso ? WHEN.format(new Date(iso)) : "");

const STATUS_LABEL: Record<string, string> = {
  manual_pending: "Waiting to forward",
  held: "Held (development)",
  duplicate: "Duplicate",
  queued: "Queued",
  failed: "Delivery failed",
  forwarded: "Forwarded",
};

function LeadTable({ leads, showAction, label }: { leads: AdminLead[]; showAction: boolean; label: string }) {
  if (leads.length === 0) return <p className="muted">None.</p>;
  return (
    <div className="table-scroll">
      <table className="admin-table" aria-label={label}>
        <thead>
          <tr>
            <th scope="col">Received</th>
            <th scope="col">Contact</th>
            <th scope="col">Project</th>
            <th scope="col">Roof</th>
            <th scope="col">Source</th>
            <th scope="col">Status</th>
            {showAction ? <th scope="col">Forward</th> : null}
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => (
            <tr key={l.id}>
              <td className="num">{when(l.createdAt)}</td>
              <td>
                <strong>{l.name}</strong>
                <br />
                <a href={`tel:${l.phone}`} className="num">
                  {l.phone}
                </a>
                <br />
                <a href={`mailto:${l.email}`}>{l.email}</a>
              </td>
              <td>
                {l.address}
                <br />
                <span className="muted">{timing(l.timing)}</span>
              </td>
              <td className="num">
                {l.estimateSummary?.squares != null ? `${l.estimateSummary.squares} squares` : "Size unknown"}
                {l.estimateSummary?.maxPitch ? `, ${l.estimateSummary.maxPitch}` : ""}
                {l.estimateSummary?.currentRoof ? <><br />Now {l.estimateSummary.currentRoof.replace("_", " ")}</> : null}
                <br />
                <a href={`/estimate/${l.estimateId}`}>Estimate</a>
              </td>
              <td>{l.attribution.ad_group_id ? `Ad group ${l.attribution.ad_group_id}` : (l.attribution.utm_source ?? "Direct")}</td>
              <td>
                {STATUS_LABEL[l.forwardStatus] ?? l.forwardStatus}
                {l.forwardedAt ? <><br /><span className="muted num">{when(l.forwardedAt)}</span></> : null}
                {l.buyerRef ? <><br /><span className="muted">{l.buyerRef}</span></> : null}
                {l.duplicateOf ? <><br /><span className="muted">Same phone as {l.duplicateOf.slice(0, 8)}</span></> : null}
              </td>
              {showAction ? (
                <td>
                  <form method="post" action={`/api/admin/leads/${l.id}/forwarded`} className="admin-forward">
                    <label htmlFor={`ref-${l.id}`} className="hint">
                      Roofer or reference (optional)
                    </label>
                    <input id={`ref-${l.id}`} className="input" name="buyerRef" maxLength={200} />
                    <button type="submit" className="btn btn-secondary">
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

export function LeadsView({ email, leads }: { email: string; leads: AdminLead[] }) {
  const pending = leads.filter((l) => l.forwardStatus === "manual_pending" || l.forwardStatus === "failed" || l.forwardStatus === "queued");
  const forwarded = leads.filter((l) => l.forwardStatus === "forwarded");
  const other = leads.filter((l) => l.forwardStatus === "duplicate" || l.forwardStatus === "held");

  return (
    <>
      <div className="estimate-title">
        <div>
          <h1 className="h1-page">Leads</h1>
          <p className="address">
            Signed in as {email}. Forward each request to a local roofer within one business day, then mark it forwarded.
          </p>
        </div>
        <div className="admin-actions">
          <a href="/api/admin/leads/export" className="btn btn-secondary">
            Download CSV
          </a>
          <form action={signOut}>
            <button type="submit" className="link-button">
              Sign out
            </button>
          </form>
        </div>
      </div>
      <section className="admin-section" aria-labelledby="pending-h">
        <h2 id="pending-h" className="h2-sheet">
          Waiting to forward <span className="num">({pending.length})</span>
        </h2>
        <LeadTable leads={pending} showAction label="Waiting to forward" />
      </section>
      <section className="admin-section" aria-labelledby="forwarded-h">
        <h2 id="forwarded-h" className="h2-sheet">
          Forwarded <span className="num">({forwarded.length})</span>
        </h2>
        <LeadTable leads={forwarded} showAction={false} label="Forwarded" />
      </section>
      <section className="admin-section" aria-labelledby="other-h">
        <h2 id="other-h" className="h2-sheet">
          Duplicates and held <span className="num">({other.length})</span>
        </h2>
        <p className="small muted">
          Duplicates are the same phone within 30 days and aren&apos;t forwarded again. Held leads come from development
          mode.
        </p>
        <LeadTable leads={other} showAction label="Duplicates and held" />
      </section>
    </>
  );
}
