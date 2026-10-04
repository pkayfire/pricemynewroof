// PLACEHOLDER: the quote form (name, phone, email, timing, consent) is Milestone 4.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getEstimateView } from "@/lib/estimates/source";

export const metadata: Metadata = {
  title: "Request quotes",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const estimate = await getEstimateView(id);
  if (!estimate) notFound();
  return (
    <main id="main" className="container estimate-main">
      <h1 className="h1-page">Request quotes from local roofers</h1>
      <section className="panel state-panel">
        <p>The quote request form isn&apos;t open yet. Nothing has been sent to any roofer.</p>
        <p>
          <Link href={`/estimate/${encodeURIComponent(estimate.estimateId)}`}>Back to your estimate</Link>
        </p>
      </section>
    </main>
  );
}
