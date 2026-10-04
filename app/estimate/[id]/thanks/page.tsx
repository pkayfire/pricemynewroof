// /estimate/[id]/thanks: confirmation and what happens next (docs/SPEC.md Routes). noindex.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buyerConfigFromEnv } from "@/lib/buyer/config";
import { getEstimateView } from "@/lib/estimates/source";
import { nextSteps } from "@/lib/site/copy";
import { CONTACT_EMAIL } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Request received",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

export default async function ThanksPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ duplicate?: string }>;
}) {
  const { id } = await params;
  const { duplicate } = await searchParams;
  const estimate = await getEstimateView(id);
  if (!estimate) notFound();
  const mode = buyerConfigFromEnv().buyerMode;
  const steps = nextSteps(mode);

  return (
    <main id="main" className="container estimate-main">
      <h1 className="h1-page">{duplicate === "1" ? "We already have your request" : "Your request is in"}</h1>
      <section className="panel state-panel" aria-label="What happens next">
        {duplicate === "1" ? (
          <p className="note" role="status">
            <strong>No need to send it again.</strong> We received a request with this phone number in the last 30
            days, so we won&apos;t pass it on a second time. We&apos;re already handling your earlier request.
          </p>
        ) : (
          <p role="status">Thanks. We&apos;ve saved your quote request.</p>
        )}
        <h2 className="h3">What happens next</h2>
        <ol className="next-steps">
          {steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <p className="referral">
          Price My New Roof is a referral service, not a roofing contractor. Your estimate is a general estimate, not a
          quote.
        </p>
        <p className="small">
          Changed your mind? Email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and we won&apos;t pass your request on.
        </p>
        <p>
          <Link href={`/estimate/${encodeURIComponent(estimate.estimateId)}`}>Back to your estimate</Link>
        </p>
      </section>
    </main>
  );
}
