// LEGAL DRAFT pending legal review.
import type { Metadata } from "next";
import Link from "next/link";
import { BusinessContact } from "@/components/BusinessContact";
import { CONTACT_EMAIL, GOVERNING_STATE, LEGAL_ENTITY, LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "The terms for using Price My New Roof, a roof cost estimate and referral service.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use">
      <p>
        These terms are an agreement between you and {LEGAL_ENTITY} (&ldquo;Price My New Roof&rdquo;, &ldquo;we&rdquo;,
        &ldquo;us&rdquo;) for your use of pricemynewroof.com (the &ldquo;site&rdquo;). By using the site you agree to
        them. If you don&apos;t agree, please don&apos;t use the site.
      </p>

      <h2>What the service is</h2>
      <p>
        Price My New Roof gives general roof replacement cost estimates and, if you ask, passes your request for quotes
        to a roofer or to a partner that connects homeowners with roofers. We are an independent referral service, not
        a roofing contractor. We don&apos;t inspect roofs, perform, supervise or warrant any roofing work, or set any
        roofer&apos;s prices. Roofers and partners may pay us for referrals.
      </p>

      <h2>Estimates are not quotes</h2>
      <p>
        Every price on the site is a general estimate, not a quote or an offer. Estimates come from satellite-based
        measurements, published national installed costs, public wage and price data, and assumptions described on{" "}
        <Link href="/how-we-estimate">How we estimate</Link>. They can&apos;t account for things like underlayment or
        decking condition, existing layers, local code and permit requirements, access, or changes since the imagery
        was taken, and real quotes may fall outside the range. Don&apos;t rely on an estimate as the price of a job;
        get a written quote from a roofer.
      </p>
      <p>
        The &ldquo;Why this price&rdquo; note is written automatically from the estimate&apos;s computed facts and may
        be imperfect.
      </p>

      <h2>Quote requests and roofers</h2>
      <ul>
        <li>We pass on a quote request only when you ask us to, and we can only do so where we work with roofers.</li>
        <li>We can&apos;t promise that a roofer will contact you, give a quote, or do the work at any price.</li>
        <li>
          Roofers are independent businesses, not our employees or agents. Any agreement for roofing work is between you
          and the roofer. Check a roofer&apos;s license, insurance and references before you hire them.
        </li>
        <li>
          By submitting a quote request you agree to be contacted as described in the consent shown on the request
          form and in our <Link href="/privacy">privacy policy</Link>.
        </li>
      </ul>

      <h2>Using the site</h2>
      <p>You agree to:</p>
      <ul>
        <li>give accurate information, and request estimates or quotes only for property you own or are authorized to act for;</li>
        <li>not use bots, scrapers or other automated means to run estimates or copy content, and not try to get around usage limits;</li>
        <li>not interfere with the site&apos;s security or operation, or reverse engineer it;</li>
        <li>not use the site to break the law or to infringe anyone&apos;s rights;</li>
        <li>not submit someone else&apos;s contact details without their permission.</li>
      </ul>
      <p>We may limit, suspend or end access to the site for anyone who breaks these terms.</p>

      <h2>Google Maps</h2>
      <p>
        The site uses Google Maps Platform features, including maps, address search and roof data. Your use of those
        features is also subject to the{" "}
        <a href="https://maps.google.com/help/terms_maps/" rel="noopener">
          Google Maps/Google Earth Additional Terms of Service
        </a>{" "}
        and the{" "}
        <a href="https://policies.google.com/privacy" rel="noopener">
          Google Privacy Policy
        </a>
        .
      </p>

      <h2>Our content</h2>
      <p>
        The site, its design, text and software belong to us or our licensors. You may use the site and your estimate
        for your own personal, non-commercial purposes. Public data is credited on{" "}
        <Link href="/how-we-estimate">How we estimate</Link>.
      </p>

      <h2>Disclaimers</h2>
      <p>
        The site and all estimates are provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;. To the fullest extent
        the law allows, we disclaim all warranties, express or implied, including warranties of accuracy, merchantability,
        fitness for a particular purpose and non-infringement. We don&apos;t warrant that the site will be uninterrupted
        or error-free, or that any estimate will match a roofer&apos;s price.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the fullest extent the law allows, we won&apos;t be liable for any indirect, incidental, special,
        consequential or punitive damages, or for any loss arising from roofing work, a roofer&apos;s acts or omissions,
        or reliance on an estimate. Our total liability for any claim about the site is limited to $100. Some places
        don&apos;t allow these limits, so they may not apply to you.
      </p>

      <h2>Indemnity</h2>
      <p>
        You agree to indemnify us against claims arising from your misuse of the site or your breach of these terms, to
        the extent the law allows.
      </p>

      <h2>Disputes</h2>
      <p>
        These terms are governed by the laws of {GOVERNING_STATE}, without regard to conflict of laws rules. Before
        filing a claim, please contact us at {CONTACT_EMAIL} so we can try to resolve it informally. Any claim not
        resolved informally may be brought in the state or federal courts located in {GOVERNING_STATE}, or in small
        claims court where you live if it qualifies.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms. We&apos;ll post the new version here with a new date. Using the site after a change
        means you accept the updated terms.
      </p>

      <h2>Contact</h2>
      <BusinessContact />
    </LegalPage>
  );
}
