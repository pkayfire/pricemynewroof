// LEGAL DRAFT pending legal review.
// The form posts to POST /api/do-not-sell, which is a validating stub until Milestone 4 stores requests.
import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, LegalPage } from "@/components/legal/LegalPage";
import { DoNotSellForm } from "@/components/legal/DoNotSellForm";

export const metadata: Metadata = {
  title: "Do not sell or share my personal information",
  description: "Opt out of the sale or sharing of your personal information by Price My New Roof.",
  alternates: { canonical: "/do-not-sell" },
};

export default function DoNotSellPage() {
  return (
    <LegalPage title="Do not sell or share my personal information">
      <p>
        If you ask for roofing quotes, passing your request to a roofer or lead partner who pays us for referrals may
        count as a &ldquo;sale&rdquo; under California law. Measuring our ads with the OpenAI Pixel and Conversions API
        may count as &ldquo;sharing&rdquo;. You have the right to opt out of both. Details are in our{" "}
        <Link href="/privacy">privacy policy</Link>.
      </p>
      <p>
        <strong>Global Privacy Control.</strong> If your browser sends a Global Privacy Control signal, we treat it as
        an opt-out of sale and sharing for that browser, with no form needed.
      </p>
      <p>
        To opt out for the contact details you gave us on a quote request or estimate email, fill in this form or email{" "}
        {CONTACT_EMAIL}. Opting out doesn&apos;t cancel a quote request you already asked us to send; to stop one,
        contact us.
      </p>
      <h2>Opt-out request</h2>
      <DoNotSellForm />
    </LegalPage>
  );
}
