import type { Metadata } from "next";
import Link from "next/link";
import { loadMethodFacts } from "@/lib/site/method";
import {
  IMAGERY_OLD_YEARS,
  LABOR_RATIO_MAX,
  LABOR_RATIO_MIN,
  MAX_BUILDING_DISTANCE_M,
  SQUARES_MAX,
  SQUARES_MIN,
  WIDENING,
} from "@/lib/engine";
import { formatImageryDate as monthName, formatUsd } from "@/lib/format";
import { referralDisclosure } from "@/lib/site/copy";

export const metadata: Metadata = {
  title: "How we estimate",
  description:
    "How Price My New Roof measures your roof from satellite data and prices it with public wage and price data. A general estimate, not a quote.",
  alternates: { canonical: "/how-we-estimate" },
};

const pct = (v: number) => `${Math.round(v * 100)}%`;

export default function HowWeEstimatePage() {
  const f = loadMethodFacts();
  const options = [f.options.architectural_shingle, f.options.concrete_tile, f.options.lift_and_relay];
  const asphalt = f.ppi.asphalt;
  const concrete = f.ppi.concrete;

  return (
    <main id="main" className="container prose-page">
      <article className="prose">
        <h1 className="h1-page">How we estimate</h1>
        <p className="lede" style={{ maxWidth: 680 }}>
          Every price on Price My New Roof is a general estimate, not a quote. Here is exactly how we get from your
          address to a range, which public data we use, and what the estimate can&apos;t know.
        </p>

        <h2>The short version</h2>
        <ol>
          <li>We find your home from the address you choose, using Google Places.</li>
          <li>We measure each plane of your roof from Google&apos;s satellite-based Solar API: its area, pitch and the direction it faces.</li>
          <li>We look up roofer wages for your area from the U.S. Bureau of Labor Statistics (BLS).</li>
          <li>We price each roof option from published national installed costs, adjusted for local labor and current material prices.</li>
          <li>We round the result to a range and tell you how confident it is.</li>
        </ol>
        <p>
          The same address and the same data always produce the same estimate. Each estimate records the version of
          the data it used (currently version {f.version}).
        </p>

        <h2>Measuring your roof</h2>
        <p>
          Google&apos;s Solar API reports the roof planes it finds on the building nearest your address. For each plane
          we keep its area, its pitch and the compass direction it slopes toward. We convert area to roofing squares (1
          square = 100 sq ft) and pitch to the rise-over-12 form roofers use, like 6/12. Planes under 50 sq ft are
          grouped as &ldquo;Other&rdquo;.
        </p>
        <p>
          Material is ordered with extra for cutting and waste: 10% for roofs with up to 4 planes, 12% for 5 to 10, and
          15% for more than 10.
        </p>
        <p>
          When the satellite imagery is lower quality we still use it, but we widen the range: by{" "}
          {pct(WIDENING.imagery_medium)} for medium quality and {pct(WIDENING.imagery_low)} for low quality. Imagery{" "}
          {IMAGERY_OLD_YEARS} or more years old lowers our confidence, since recent changes may not show, but
          doesn&apos;t widen the range.
        </p>
        <p>
          If the roof we find is smaller than {SQUARES_MIN} or larger than {SQUARES_MAX} squares, or the building is
          more than {MAX_BUILDING_DISTANCE_M} meters from your address, it may be the wrong building. We show you what
          we measured and ask: if you confirm it&apos;s your house, we price it and widen the range by{" "}
          {pct(WIDENING.building_confirmed)}.
        </p>
        <p>
          If we can&apos;t find your roof, or you&apos;d rather not use the measured one, we ask for your home&apos;s
          size, stories and roof shape instead and estimate the roof area from those (living space divided by stories,
          times 1.15 for overhang and a typical pitch, times 1.0, 1.1 or 1.25 for a simple, average or complex shape).
          Those estimates are widened by {pct(WIDENING.home_size)}. When more than one of these applies, the widenings
          add up.
        </p>

        <h2>Pricing each option</h2>
        <p>Each option starts from a national installed cost per square, which includes tear-off. We split it into labor, materials and other costs, then adjust:</p>
        <div className="formula">{`cost per square = base × (labor share × local labor ratio
                         + material share × material price ratio
                         + other share)
price = squares × (1 + waste) × cost per square
      + steep squares × steep adder
      + permit`}</div>
        <p>We work out the low and high ends separately, then round the low end down and the high end up to the nearest $500.</p>

        <div className="table-scroll">
          <table>
            <caption className="visually-hidden">National base costs per square</caption>
            <thead>
              <tr>
                <th scope="col">Option</th>
                <th scope="col">Base per square</th>
                <th scope="col">Labor / materials / other</th>
              </tr>
            </thead>
            <tbody>
              {options.map((o) => (
                <tr key={o.name}>
                  <th scope="row" style={{ fontWeight: 500 }}>
                    {o.name}
                  </th>
                  <td>
                    {formatUsd(o.low)}–{formatUsd(o.high)}
                  </td>
                  <td>
                    {pct(o.shares.labor)} / {pct(o.shares.material)} / {pct(o.shares.other)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted">
          Base costs are national, as of {monthName(f.baseDate)}. We show tile options first in states where tile roofs
          are common ({f.tileStates.join(", ")}) or when you tell us the roof is tile now.
        </p>

        <h3>Where the base costs come from</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Option</th>
                <th scope="col">Source</th>
                <th scope="col">Published range per square</th>
                <th scope="col">Page date</th>
              </tr>
            </thead>
            <tbody>
              {options.flatMap((o) =>
                o.sources.map((s) => (
                  <tr key={`${o.name}-${s.url}`}>
                    <td>{o.name}</td>
                    <td>
                      <a href={s.url} rel="noopener">
                        {s.name}
                      </a>
                    </td>
                    <td>
                      {formatUsd(s.publishedLow)}–{formatUsd(s.publishedHigh)}
                      {s.note ? ` (${s.note})` : ""}
                    </td>
                    <td>{s.pageDate}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
        <p className="small muted">
          Tile lift and relay has the least published cost data: we found one regional source. Estimates that show it
          first are marked low confidence.
        </p>

        <h2>Local labor</h2>
        <p>
          We map your ZIP code to its metro area with the HUD USPS ZIP code crosswalk ({f.hud.year} Q{f.hud.quarter}),
          then look up the median hourly wage for roofers (occupation {f.wages.occupation}) in the BLS Occupational
          Employment and Wage Statistics, {f.wages.release} release. ZIP codes outside a metro area use their
          nonmetropolitan area. Your local labor ratio is that wage divided by the national median, kept between{" "}
          {LABOR_RATIO_MIN} and {LABOR_RATIO_MAX}. If BLS doesn&apos;t publish a wage for your area, we use your
          state&apos;s, then the national figure, widen the range by {pct(WIDENING.wage_state)}, and say so on your
          estimate.
        </p>

        <h2>Material prices</h2>
        <p>
          Material costs follow the BLS producer price index: series{" "}
          <a href={asphalt.sourceUrl} rel="noopener">
            {asphalt.seriesId}
          </a>{" "}
          (asphalt roofing products) for shingles and for the underlayment in tile lift and relay, and series{" "}
          <a href={concrete.sourceUrl} rel="noopener">
            {concrete.seriesId}
          </a>{" "}
          (concrete products) for new concrete tile. The material price ratio is the latest index value divided by its
          value in {monthName(asphalt.basePeriod)}, the month our base costs are set to.
        </p>

        <h2>Steep roofs and permits</h2>
        <p>
          Planes steeper than 6/12 take longer to work safely. We add {formatUsd(f.steepAdder.low)} to{" "}
          {formatUsd(f.steepAdder.high)} per steep square. Permits are estimated at {Math.round(f.permit.percentOfJob * 100)}% of
          the job, at least {formatUsd(f.permit.min)} and at most {formatUsd(f.permit.max)}; actual fees vary by city.
          In the cost breakdown, steep-roof work and the permit are part of &ldquo;Tear-off, overhead, steep-roof work
          and permit&rdquo;.
        </p>

        <h2>Confidence</h2>
        <ul>
          <li>High: good satellite imagery and a wage for your metro area.</li>
          <li>Medium: one fallback, such as medium-quality or older imagery, a confirmed building or a state wage.</li>
          <li>Low: two or more fallbacks, or tile lift and relay is the first option shown.</li>
        </ul>

        <h2>The &ldquo;Why this price&rdquo; note</h2>
        <p>
          A small AI language model writes a two or three sentence summary of the biggest drivers of your price. It sees
          only the computed facts (roof size, sections, steepness, area name and wage comparison, cost shares), never
          your address or contact details, and it never sets a price. We check every note: each number must match the
          computed facts, and it must be short and avoid promises. If a note fails a check or takes too long, we show a
          fixed template built from the same facts instead.
        </p>

        <h2>What the estimate can&apos;t know</h2>
        <ul>
          <li>The condition of the underlayment and decking, or how many layers of roofing are already there.</li>
          <li>Flashing, chimneys, skylights, vents, gutters and other details a roofer prices on site.</li>
          <li>Changes since the satellite imagery was taken; trees and shadows can also hide parts of a roof.</li>
          <li>Your city&apos;s actual permit fees, local code requirements and how easy the roof is to reach.</li>
          <li>Any one roofer&apos;s prices. Real quotes can fall outside the range.</li>
        </ul>
        <p>That&apos;s why it&apos;s a general estimate, not a quote. A roofer confirms the details on site.</p>

        <h2>How referrals work</h2>
        <p>{referralDisclosure()}</p>

        <h2>Data sources</h2>
        <ul>
          <li>
            <a href="https://developers.google.com/maps/documentation/solar" rel="noopener">
              Google Maps Platform Solar API
            </a>{" "}
            (roof planes, areas, pitch and direction) and Google Places (address lookup). Measurements are shown on a
            Google map and kept for no more than 30 days.
          </li>
          <li>
            <a href="https://www.bls.gov/oes/" rel="noopener">
              BLS Occupational Employment and Wage Statistics
            </a>
            , occupation 47-2181,{" "}
            <a href="https://www.bls.gov/oes/current/oes472181.htm" rel="noopener">
              Roofers
            </a>
            .
          </li>
          <li>
            BLS producer price index series{" "}
            <a href={asphalt.sourceUrl} rel="noopener">
              {asphalt.seriesId}
            </a>{" "}
            and{" "}
            <a href={concrete.sourceUrl} rel="noopener">
              {concrete.seriesId}
            </a>
            .
          </li>
          <li>
            <a href="https://www.huduser.gov/portal/datasets/usps_crosswalk.html" rel="noopener">
              HUD USPS ZIP code crosswalk files
            </a>
            .
          </li>
          <li>The published cost guides listed in the table above.</li>
        </ul>
        <p className="small muted">
          BLS and HUD data are public. Price My New Roof is not affiliated with or endorsed by BLS, HUD or Google. Data
          version {f.version}, built {f.builtAt.slice(0, 10)}.
        </p>
        <p>
          <Link href="/">Measure my roof</Link>
        </p>
      </article>
    </main>
  );
}
