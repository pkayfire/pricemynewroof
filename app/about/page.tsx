import type { Metadata } from "next";
import Link from "next/link";
import { BusinessContact } from "@/components/BusinessContact";
import { BUSINESS } from "@/lib/site/business";

export const metadata: Metadata = {
  title: "About",
  description: `${BUSINESS.brand} is operated by ${BUSINESS.legalName}. Free roof replacement cost estimates and referrals to local roofers.`,
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <main id="main" className="container prose-page">
      <article className="prose">
        <h1 className="h1-page">About {BUSINESS.brand}</h1>
        <p>
          {BUSINESS.brand} is operated by {BUSINESS.legalName}. We help homeowners in the United States see what replacing
          their roof should cost before any roofer visits.
        </p>

        <h2>What we do</h2>
        <p>
          You enter your address. We measure your roof from Google satellite data, plane by plane, and price it with
          national installed costs, roofer wages for your area from the U.S. Bureau of Labor Statistics, and the
          government&apos;s producer price index for roofing materials. You see the range for each roof option, free, without
          giving us any contact details. It&apos;s a general estimate, not a quote. <Link href="/how-we-estimate">How we estimate</Link>{" "}
          explains the method and its limits.
        </p>

        <h2>How referrals work</h2>
        <p>
          {BUSINESS.brand} is an independent referral service, not a roofing contractor. We don&apos;t do roofing work or
          inspect roofs. If you ask for quotes, we pass your request to a local roofer within one business day. Seeing
          your estimate never shares your details, and homeowners don&apos;t pay us anything.
        </p>

        <h2>Contact</h2>
        <BusinessContact />
        <p>
          For privacy requests, see our <Link href="/privacy">privacy policy</Link> or use the{" "}
          <Link href="/do-not-sell">opt-out form</Link>.
        </p>
      </article>
    </main>
  );
}
