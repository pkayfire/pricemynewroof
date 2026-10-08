import type { Metadata } from "next";
import Link from "next/link";
import { BusinessContact } from "@/components/BusinessContact";
import { BUSINESS } from "@/lib/site/business";

export const metadata: Metadata = {
  title: "Contact",
  description: `Contact ${BUSINESS.legalName}, the company behind ${BUSINESS.brand}.`,
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <main id="main" className="container prose-page">
      <article className="prose">
        <h1 className="h1-page">Contact us</h1>
        <p>
          {BUSINESS.brand} is operated by {BUSINESS.legalName}. Email is the fastest way to reach us.
        </p>
        <BusinessContact />

        <h2>Already asked for quotes?</h2>
        <p>
          If you no longer want us to pass your request to a roofer, email us from the address you used and we won&apos;t send
          it on.
        </p>

        <h2>Privacy requests</h2>
        <p>
          To access or delete your information, or to opt out of the sale or sharing of personal information, email us
          or use the <Link href="/do-not-sell">opt-out form</Link>. Our <Link href="/privacy">privacy policy</Link> explains
          what we collect.
        </p>
      </article>
    </main>
  );
}
