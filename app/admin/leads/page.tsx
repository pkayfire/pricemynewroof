// /admin/leads: pending and forwarded leads from the leads table, with CSV export. Admin only.
import { redirect } from "next/navigation";
import { ADMIN_LEAD_LIMIT } from "@/lib/admin/endpoints";
import { currentAdmin } from "@/lib/admin/session";
import { getLeadStore } from "@/lib/server/deps";
import { LeadsView } from "@/components/admin/LeadsView";
import { demoLeads } from "@/lib/admin/demo-leads";
import { demoEstimatesEnabled } from "@/lib/estimates/source";
import { signOut } from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminLeads({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  // Synthetic sample rows for local screenshots only: never in production (see demoEstimatesEnabled).
  if (demoEstimatesEnabled() && (await searchParams).demo === "1") return <LeadsView email="admin@example.test" leads={demoLeads()} />;
  const admin = await currentAdmin();
  if (admin.status === "unconfigured") {
    return (
      <>
        <h1 className="h1-page">Leads</h1>
        <p className="note">
          <strong>Sign-in isn&apos;t configured.</strong> Set NEXT_PUBLIC_SUPABASE_ANON_KEY to enable it.
        </p>
      </>
    );
  }
  if (admin.status === "unauthenticated") redirect("/admin/login");
  if (admin.status === "forbidden") {
    return (
      <>
        <h1 className="h1-page">Leads</h1>
        <p className="note">This account isn&apos;t allowed to view leads.</p>
        <form action={signOut}>
          <button type="submit" className="link-button">
            Sign out
          </button>
        </form>
      </>
    );
  }

  const leads = await getLeadStore().list(ADMIN_LEAD_LIMIT);
  return <LeadsView email={admin.email} leads={leads} />;
}

