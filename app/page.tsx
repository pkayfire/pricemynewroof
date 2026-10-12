import type { Metadata } from "next";
import { AddressForm } from "@/components/AddressForm";
import { SampleRoofIllustration } from "@/components/SampleRoofIllustration";
import { referralDisclosure } from "@/lib/site/copy";
import { LANDING_LEDE, landingHeadline } from "@/lib/site/landing-copy";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

// Reading searchParams makes this page dynamically rendered. That is intended: the headline matches the
// ad group in the server HTML, so crawlers such as OAI-AdsBot see it without running JavaScript.
export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ad_group_id: adGroupParam } = await searchParams;
  const headline = landingHeadline(typeof adGroupParam === "string" ? adGroupParam : undefined);
  // Browser key, referrer-restricted to our domains; it is meant to be public.
  const mapsKey = process.env.GOOGLE_MAPS_API_KEY || null;

  return (
    <main id="main">
      <section className="container hero">
        <div className="hero-copy">
          <h1 className="h1-landing">{headline}</h1>
          <p className="lede">{LANDING_LEDE}</p>
          <AddressForm apiKey={mapsKey} />
        </div>

        <figure className="hero-figure">
          <div className="illustration">
            <SampleRoofIllustration />
          </div>
          <figcaption>
            <span>Sample roof</span>
            <span className="num">6 main planes, 2,040 sq ft</span>
          </figcaption>
        </figure>
      </section>

      <section className="band" aria-labelledby="built-from">
        <div className="container">
          <div className="band-intro">
            <h2 id="built-from" className="h2-section">
              What your estimate is built from
            </h2>
            <p className="muted">It&apos;s a general estimate, not a quote. Here&apos;s what goes into it, and what it can&apos;t know.</p>
          </div>
          <dl className="title-block">
            <div>
              <dt>Roof area</dt>
              <dd>Measured from satellite data, one plane at a time, including the parts you can&apos;t see from the street.</dd>
            </div>
            <div>
              <dt>Pitch</dt>
              <dd>Measured for each plane. Steeper roofs take longer to work safely, so they cost more.</dd>
            </div>
            <div>
              <dt>Local labor</dt>
              <dd>Roofer wages in your area, from the U.S. Bureau of Labor Statistics.</dd>
            </div>
            <div>
              <dt>Materials</dt>
              <dd>National installed costs, adjusted by the government&apos;s producer price index for roofing materials.</dd>
            </div>
            <div>
              <dt>What it can&apos;t see</dt>
              <dd>Underlayment condition and damaged decking. A roofer confirms those on site.</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="container referral-note" aria-label="About this service">
        <p>{referralDisclosure()}</p>
      </section>
    </main>
  );
}
