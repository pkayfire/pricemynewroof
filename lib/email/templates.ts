// Email bodies. Plain text for now; restyle with the provider.
import { TIMING_OPTIONS, type Timing } from "@/lib/api/contracts";
import type { EstimateRecord } from "@/lib/estimates/types";
import type { EmailMessage } from "./index";

const site = (url: string) => url.replace(/\/+$/, "");
const usd = (n: number) => `$${n.toLocaleString("en-US")}`;
const timingLabel = (t: Timing) => TIMING_OPTIONS.find((o) => o.id === t)?.label ?? t;

/**
 * New-lead alert to the admin: one per lead, linking to /admin/leads.
 * DECISION: the alert carries no contact details (name, phone, email); those stay behind admin
 * sign-in. It names the ZIP, timing and status only.
 */
export function leadAlertEmail(args: { to: string; leadId: string; zip: string; timing: Timing; status: string; siteUrl: string }): EmailMessage {
  return {
    kind: "lead_alert",
    to: args.to,
    refId: args.leadId,
    subject: `New quote request in ZIP ${args.zip}`,
    text: [
      `A new quote request came in on Price My New Roof.`,
      ``,
      `ZIP: ${args.zip}`,
      `Timing: ${timingLabel(args.timing)}`,
      `Status: ${args.status}`,
      ``,
      `Open the leads page to see the details and forward it within one business day:`,
      `${site(args.siteUrl)}/admin/leads`,
    ].join("\n"),
  };
}

/** "Email me this estimate" (no-coverage panel). */
export function estimateEmail(args: { to: string; signupId: string; estimate: EstimateRecord; notifyWhenCovered: boolean; siteUrl: string }): EmailMessage {
  const e = args.estimate;
  const lines = [`Here is the roof replacement estimate you asked us to send.`, ``];
  if (e.options && e.options.length > 0) {
    for (const o of e.options) lines.push(`${o.name}: ${usd(o.low)} to ${usd(o.high)}`);
  } else {
    lines.push(`We need a few details about your home to finish this estimate.`);
  }
  lines.push(
    ``,
    `A general estimate, not a quote. Actual prices depend on an on-site inspection.`,
    `See it again: ${site(args.siteUrl)}/estimate/${e.id}`,
    `How we estimate: ${site(args.siteUrl)}/how-we-estimate`,
    ``,
  );
  if (args.notifyWhenCovered) lines.push(`We'll email you if partner roofers become available in your area.`, ``);
  lines.push(`Price My New Roof is a referral service, not a contractor.`, `pricemynewroof.com`);
  return {
    kind: "estimate",
    to: args.to,
    refId: args.signupId,
    subject: "Your roof estimate from Price My New Roof",
    text: lines.join("\n"),
  };
}
