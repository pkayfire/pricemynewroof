// LEGAL DRAFT pending legal review. Placeholders: [LEGAL ENTITY NAME], [CONTACT EMAIL], [EFFECTIVE DATE].
// DECISION: retention periods (quote requests and consent 5 years, logs 13 months) are proposals.
// DECISION: says OpenAI Conversions API reports may include hashed email/phone; confirm against the
// Milestone 4 integration and drop that sentence if it sends only the click ID.
import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, LEGAL_ENTITY, LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What Price My New Roof collects, how it's used and shared, and your privacy choices.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy">
      <p>
        This policy explains how {LEGAL_ENTITY} (&ldquo;Price My New Roof&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;)
        collects, uses and shares personal information when you use pricemynewroof.com (the &ldquo;site&rdquo;). Price
        My New Roof is an independent referral service, not a roofing contractor.
      </p>

      <h2>The short version</h2>
      <ul>
        <li>You can see a roof estimate without giving us your name, phone number or email.</li>
        <li>
          We collect contact details only when you ask for quotes or ask us to email your estimate, and we pass a quote
          request to a roofer only when you ask us to.
        </li>
        <li>Satellite measurements of your roof, and the address they belong to, are deleted after 30 days.</li>
        <li>
          We use advertising measurement tools from OpenAI. You can opt out of the sale or sharing of your personal
          information at <Link href="/do-not-sell">Do not sell or share my personal information</Link>, and we honor
          Global Privacy Control signals.
        </li>
      </ul>

      <h2>Information we collect</h2>
      <h3>Information you give us</h3>
      <ul>
        <li>
          <strong>Your address</strong>, when you look up a roof, and the answers you give about your home (home size,
          stories, roof shape and what&apos;s on the roof now).
        </li>
        <li>
          <strong>Quote requests</strong>: your name, phone number, email address, ZIP code and when you want the work
          done, plus a record of the consent you gave (the consent wording shown, the time, your IP address, browser
          and the page you were on, and a consent certificate ID where a roofer or partner requires one).
        </li>
        <li>
          <strong>Estimate emails</strong>: your email address and whether you asked to hear when roofers are available
          in your area.
        </li>
        <li>
          <strong>Privacy requests</strong>: the details you give us so we can find your records and act on the request.
        </li>
      </ul>
      <h3>Information collected automatically</h3>
      <ul>
        <li>Device and usage information: IP address, browser and device type, pages viewed, the steps of the estimate you reach, and the page that referred you.</li>
        <li>
          Advertising and campaign information: when you arrive from an ad, the ad click identifier and campaign
          parameters in the link (for example an ad group ID or UTM tags). We keep these in a first-party cookie and in
          your browser&apos;s session storage for up to 30 days so we can tell which ads lead to estimates and requests.
        </li>
        <li>Information collected by the OpenAI and Google tools described below.</li>
      </ul>
      <h3>Information from other sources</h3>
      <ul>
        <li>
          From Google Maps Platform: the location, ZIP code and formatted address for the place you choose, and roof
          measurements derived from satellite data (plane areas, pitch, direction and imagery date).
        </li>
        <li>From public government data: wage and price figures for your area. These describe the area, not you.</li>
      </ul>

      <h2>How we use information</h2>
      <ul>
        <li>To measure your roof, calculate and show your estimate, and email it to you if you ask.</li>
        <li>To pass your quote request to a roofer, and to follow up on it, only when you ask for quotes.</li>
        <li>To tell you when roofers become available in your area, if you ask us to.</li>
        <li>To measure which ads and pages lead to estimates and requests, and to improve the site and our ads.</li>
        <li>To keep the site secure, prevent abuse (for example, limiting how many estimates one connection can run) and fix problems.</li>
        <li>To keep records of consent and comply with law, and to enforce our <Link href="/terms">terms</Link>.</li>
      </ul>
      <p>
        The &ldquo;Why this price&rdquo; note on your estimate is written by an AI language model from computed roof
        facts only (roof size, number of sections, steepness, area name, wage comparison and cost shares). We never send
        it your address or contact details.
      </p>

      <h2>How we share information</h2>
      <ul>
        <li>
          <strong>Roofers</strong>: when you request quotes, we send your request (name, phone, email, ZIP code, timing
          and, where accepted, your roof measurements and current roof type) to a roofer or to a lead partner that
          connects homeowners with roofers. Roofers and partners may pay us for referrals. Seeing an estimate never
          shares your details with a roofer.
        </li>
        <li>
          <strong>Service providers</strong> that process information for us under contract:
          <ul>
            <li>Vercel, which hosts the site and runs our servers;</li>
            <li>Supabase, which hosts our database;</li>
            <li>
              Google Maps Platform (Maps, Places and the Solar API), which provides address search, the satellite map and
              roof measurements. Google&apos;s use of information is governed by the{" "}
              <a href="https://policies.google.com/privacy" rel="noopener">
                Google Privacy Policy
              </a>
              ;
            </li>
            <li>Anthropic, whose AI model writes the &ldquo;Why this price&rdquo; note from roof facts only;</li>
            <li>email delivery providers, if you ask us to email your estimate.</li>
          </ul>
        </li>
        <li>
          <strong>OpenAI advertising measurement</strong>: we use the OpenAI Pixel on our pages and OpenAI&apos;s
          Conversions API from our servers to report page views, estimate steps and completed requests, with the ad click
          identifier, so OpenAI can measure and improve our ads. Conversion reports may include your email address or
          phone number in hashed (scrambled) form so they can be matched to an ad click.
        </li>
        <li>
          <strong>Legal and safety</strong>: when required by law or legal process, or to protect the rights, safety and
          property of our users, us or others.
        </li>
        <li>
          <strong>Business transfers</strong>: as part of a merger, acquisition or sale of assets, subject to this
          policy.
        </li>
      </ul>

      <h2>Selling and sharing under California law</h2>
      <p>
        California law treats some disclosures as a &ldquo;sale&rdquo; or &ldquo;sharing&rdquo; even when no data is
        sold for money in the usual sense. Passing a quote request to a roofer or lead partner who pays us for referrals
        may be a sale. Using the OpenAI Pixel and Conversions API to measure ads may be sharing for cross-context
        behavioral advertising. We do not knowingly sell or share the personal information of anyone under 16.
      </p>
      <p>
        You can opt out at any time at <Link href="/do-not-sell">Do not sell or share my personal information</Link>. We
        also treat a Global Privacy Control (GPC) signal from your browser as an opt-out of sale and sharing for that
        browser. Opting out of sale doesn&apos;t cancel a quote request you asked us to send; to stop one, contact us.
      </p>

      <h3>Categories of personal information in the last 12 months</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">Examples</th>
              <th scope="col">Disclosed for a business purpose to</th>
              <th scope="col">Sold or shared to</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Identifiers</td>
              <td>Name, email, phone, IP address, ad click and session IDs</td>
              <td>Service providers</td>
              <td>Roofers and lead partners (quote requests); OpenAI (ad measurement)</td>
            </tr>
            <tr>
              <td>Customer records</td>
              <td>Name, phone, address entered</td>
              <td>Service providers</td>
              <td>Roofers and lead partners (quote requests)</td>
            </tr>
            <tr>
              <td>Property information</td>
              <td>Roof measurements, home size, current roof type</td>
              <td>Service providers</td>
              <td>Roofers and lead partners, where accepted</td>
            </tr>
            <tr>
              <td>Internet activity</td>
              <td>Pages viewed, estimate steps, referring ad</td>
              <td>Service providers</td>
              <td>OpenAI (ad measurement)</td>
            </tr>
            <tr>
              <td>Geolocation</td>
              <td>ZIP code and the location of the address you enter</td>
              <td>Service providers</td>
              <td>Roofers and lead partners (ZIP code, with a quote request)</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="small muted">
        Sources: you, your device, Google Maps Platform and public government data. Purposes: those listed in How we use
        information. We don&apos;t collect sensitive personal information to infer characteristics about you.
      </p>

      <h2>Your privacy rights</h2>
      <p>
        Depending on where you live, including California, Colorado, Connecticut, Virginia, Utah, Texas, Oregon and other
        states with privacy laws, you may have the right to:
      </p>
      <ul>
        <li>know what personal information we have about you and get a copy;</li>
        <li>correct inaccurate information;</li>
        <li>delete your information;</li>
        <li>opt out of the sale or sharing of your information, and of targeted advertising;</li>
        <li>appeal our decision on a request, by replying to our decision;</li>
        <li>not be treated differently for using these rights.</li>
      </ul>
      <p>
        To make a request, email {CONTACT_EMAIL} or use the <Link href="/do-not-sell">opt-out form</Link>. We&apos;ll
        verify the request by matching the email or phone number you used, and answer within the time the law requires
        (45 days for most California requests, 15 business days for opt-outs). An authorized agent may make a request
        for you with your signed permission.
      </p>

      <h2>Calls and texts</h2>
      <p>
        If you request quotes, a roofer or lead partner may call or text you about your request at the number you give,
        as described in the consent you agree to on the request form. Consent is not a condition of buying anything. You
        can reply STOP to texts or ask the caller to stop calling you.
      </p>

      <h2>Cookies and similar tools</h2>
      <p>
        We use a first-party cookie and session storage to remember how you arrived (ad and campaign parameters) for up
        to 30 days. The OpenAI Pixel and the Google map set or read their own cookies and identifiers. You can block or
        clear cookies in your browser; the site still works, but we may not be able to tell which ad brought you.
      </p>

      <h2>How long we keep information</h2>
      <ul>
        <li>Satellite-derived roof measurements and the address of an estimate: 30 days. After that we keep only the ZIP code with the estimate.</li>
        <li>Quote requests and consent records: up to 5 years, to show that we had your consent.</li>
        <li>Estimate email sign-ups: until you unsubscribe or ask us to delete them.</li>
        <li>Opt-out and privacy request records: at least 24 months, as California law requires.</li>
        <li>Server and event logs: up to 13 months.</li>
      </ul>

      <h2>Children</h2>
      <p>The site is for adults. We don&apos;t knowingly collect personal information from anyone under 16.</p>

      <h2>Security</h2>
      <p>
        We use encryption in transit, access controls and a database that only our servers can reach. No method of
        storage or transmission is completely secure.
      </p>

      <h2>Changes to this policy</h2>
      <p>We&apos;ll post any changes here and update the date above. Significant changes will be highlighted on the site.</p>

      <h2>Contact</h2>
      <p>
        {LEGAL_ENTITY}, {CONTACT_EMAIL}
      </p>
    </LegalPage>
  );
}
