// CSV export of the leads table (GET /api/admin/leads/export). RFC 4180 quoting, plus
// spreadsheet formula-injection protection: a cell starting with = + - @ tab or CR is prefixed
// with an apostrophe, except plain numbers such as an E.164 phone (+16025550123).
import { TIMING_OPTIONS } from "@/lib/api/contracts";
import type { AdminLead } from "@/lib/server/stores";

const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^[+-]?\d+(\.\d+)?$/;

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (FORMULA_START.test(s) && !PLAIN_NUMBER.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
}

export const csvRow = (cells: unknown[]) => cells.map(csvCell).join(",");

const COLUMNS: [string, (l: AdminLead) => unknown][] = [
  ["id", (l) => l.id],
  ["created_at", (l) => l.createdAt],
  ["forward_status", (l) => l.forwardStatus],
  ["forwarded_at", (l) => l.forwardedAt],
  ["buyer_ref", (l) => l.buyerRef],
  ["duplicate_of", (l) => l.duplicateOf],
  ["name", (l) => l.name],
  ["phone", (l) => l.phone],
  ["email", (l) => l.email],
  ["timing", (l) => TIMING_OPTIONS.find((t) => t.id === l.timing)?.label ?? l.timing],
  ["address", (l) => l.address],
  ["zip", (l) => l.zip],
  ["state", (l) => l.state],
  ["squares", (l) => l.estimateSummary?.squares],
  ["max_pitch", (l) => l.estimateSummary?.maxPitch],
  ["current_roof", (l) => l.estimateSummary?.currentRoof],
  ["estimate_id", (l) => l.estimateId],
  ["consent_version", (l) => l.consentVersion],
  ["consent_text_hash", (l) => l.consentTextHash],
  ["consent_ts", (l) => l.consentTs],
  ["consent_cert_id", (l) => l.consentCertId],
  ["ip", (l) => l.ip],
  ["user_agent", (l) => l.userAgent],
  ["page_url", (l) => l.pageUrl],
  ["opt_out", (l) => l.optOut],
  ["oppref", (l) => l.attribution.oppref],
  ["ad_group_id", (l) => l.attribution.ad_group_id],
  ["utm_source", (l) => l.attribution.utm_source],
  ["utm_medium", (l) => l.attribution.utm_medium],
  ["utm_campaign", (l) => l.attribution.utm_campaign],
  ["utm_term", (l) => l.attribution.utm_term],
  ["utm_content", (l) => l.attribution.utm_content],
  ["session_id", (l) => l.sessionId],
];

export function leadsCsv(leads: AdminLead[]): string {
  const lines = [csvRow(COLUMNS.map(([h]) => h)), ...leads.map((l) => csvRow(COLUMNS.map(([, f]) => f(l))))];
  return lines.join("\r\n") + "\r\n";
}
