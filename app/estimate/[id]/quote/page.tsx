// /estimate/[id]/quote: the quote request form (docs/SPEC.md Routes; Lead intake). noindex.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { QuoteForm } from "@/components/quote/QuoteForm";
import { consentFor } from "@/lib/api/consent";
import { buyerConfigFromEnv } from "@/lib/buyer/config";
import { getEstimateView, isExpired } from "@/lib/estimates/source";
import { formatRange } from "@/lib/format";
import { referralSentence } from "@/lib/site/copy";

export const metadata: Metadata = {
  title: "Request quotes",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

function Unavailable({ estimateId, children }: { estimateId: string; children: React.ReactNode }) {
  return (
    <main id="main" className="container estimate-main">
      <h1 className="h1-page">Request quotes from local roofers</h1>
      <section className="panel state-panel">
        {children}
        <p>
          <Link href={`/estimate/${encodeURIComponent(estimateId)}`}>Back to your estimate</Link>
        </p>
      </section>
    </main>
  );
}

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const estimate = await getEstimateView(id);
  if (!estimate) notFound();
  const mode = buyerConfigFromEnv().buyerMode;
  const consent = consentFor(mode);

  if (isExpired(estimate) || estimate.needsFallback || estimate.options.length === 0)
    return (
      <Unavailable estimateId={estimate.estimateId}>
        <p>This estimate isn&apos;t complete or has expired, so we can&apos;t send a quote request from it. Nothing has been sent to any roofer.</p>
      </Unavailable>
    );
  if (!estimate.coverage?.covered || !consent)
    return (
      <Unavailable estimateId={estimate.estimateId}>
        <p>We don&apos;t work with roofers in this area yet, so we can&apos;t pass on a quote request. Nothing has been sent to any roofer.</p>
      </Unavailable>
    );

  return (
    <main id="main" className="container estimate-main">
      <div className="estimate-title">
        <div>
          <h1 className="h1-page">Request quotes from local roofers</h1>
          <p className="address">{referralSentence(mode)}</p>
        </div>
        <Link href={`/estimate/${encodeURIComponent(estimate.estimateId)}`} className="change-address">
          Back to your estimate
        </Link>
      </div>
      <div className="estimate-grid">
        <div className="estimate-left">
          <section className="panel state-panel quote-panel" aria-label="Your details">
            <QuoteForm
              estimateId={estimate.estimateId}
              defaultAddress={estimate.formattedAddress ?? ""}
              consentVersion={consent.version}
              consentText={consent.text}
            />
          </section>
        </div>
        <aside className="estimate-right">
          <section className="sheet quote-summary" aria-labelledby="quote-summary-heading">
            <h2 id="quote-summary-heading" className="h2-sheet">
              Your estimate
            </h2>
            <p className="muted small">{estimate.formattedAddress ?? `ZIP ${estimate.zip}`}</p>
            <ul aria-label="Roof options">
              {estimate.options.map((o) => (
                <li key={o.id} className="option-row">
                  <div className="option-text">
                    <div className="option-name">{o.name}</div>
                  </div>
                  <div className="option-range">{formatRange(o.low, o.high)}</div>
                </li>
              ))}
            </ul>
            <p className="small">A general estimate, not a quote. The roofer gives you the exact price after seeing the roof.</p>
            <p className="referral">Price My New Roof is a referral service, not a roofing contractor. {referralSentence(mode)}</p>
            <p className="fine muted">
              We use your details only for this request. See our <Link href="/privacy">privacy policy</Link>.
            </p>
          </section>
        </aside>
      </div>
    </main>
  );
}
