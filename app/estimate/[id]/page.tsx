import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { EstimateView, Measurements } from "@/lib/api/types";
import { getEstimateView, isExpired } from "@/lib/estimates/source";
import { CONFIRMABLE_REASONS } from "@/lib/estimates/view";
import { formatInt, formatSqft, formatSquares } from "@/lib/format";
import { ConfirmBuilding } from "@/components/estimate/ConfirmBuilding";
import { RoofMap } from "@/components/estimate/RoofMap";
import { MeasurementTable, PlanesSummary, measurementCaption } from "@/components/estimate/MeasurementTable";
import { CurrentRoofSelect } from "@/components/estimate/CurrentRoofSelect";
import { EstimateSheet } from "@/components/estimate/EstimateSheet";
import { FallbackForm } from "@/components/estimate/FallbackForm";
import { MeasureAgainButton } from "@/components/estimate/MeasureAgainButton";
import { TrackOnMount } from "@/components/analytics/TrackOnMount";

// Contains a home address: never indexed, never in the sitemap (docs/SPEC.md Routes).
export const metadata: Metadata = {
  title: "Your roof estimate",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

function TitleRow({ title, estimate }: { title: string; estimate: EstimateView }) {
  return (
    <div className="estimate-title">
      <div>
        <h1 className="h1-page">{title}</h1>
        <p className="address">{estimate.formattedAddress ?? `ZIP ${estimate.zip}`}</p>
      </div>
      <Link href="/" className="change-address">
        Not your house? Change the address
      </Link>
    </div>
  );
}

const SHAPE_LABEL = { simple: "Simple", average: "Average", complex: "Complex" } as const;

function HomeSizeSummary({ m }: { m: Measurements }) {
  const h = m.homeSize;
  if (!h) return null;
  return (
    <table className="home-size-table">
      <caption>
        Estimated from your answers, not satellite data: living space divided by stories, plus overhang and a
        typical pitch, adjusted for the roof&apos;s shape.
      </caption>
      <tbody>
        <tr>
          <th scope="row">Home size</th>
          <td>{formatInt(h.homeSqft)} sq ft</td>
        </tr>
        <tr>
          <th scope="row">Stories</th>
          <td>{h.stories >= 4 ? "4 or more" : h.stories}</td>
        </tr>
        <tr>
          <th scope="row">Roof shape</th>
          <td>{SHAPE_LABEL[h.shape]}</td>
        </tr>
      </tbody>
      <tfoot>
        <tr>
          <th scope="row">Estimated roof area</th>
          <td>
            {formatSqft(m.totalAreaSqft)} ({formatSquares(m.squares)} squares)
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

function ExpiredState({ estimate }: { estimate: EstimateView }) {
  return (
    <main id="main" className="container estimate-main">
      <TitleRow title="This estimate has expired" estimate={estimate} />
      <section className="panel state-panel" aria-label="Expired estimate">
        <p>
          We keep satellite measurements for 30 days, so this estimate is no longer available. Measuring again takes a
          few seconds and uses the latest imagery.
        </p>
        <MeasureAgainButton placeId={estimate.placeId} currentRoof={estimate.currentRoof} />
      </section>
    </main>
  );
}

function MeasuredRoof({ m, mapsKey }: { m: Measurements; mapsKey: string | null }) {
  return (
    <>
      <RoofMap apiKey={mapsKey} segments={m.segments} buildingCenter={m.buildingCenter} />
      <div className="planes-desktop">
        <MeasurementTable m={m} />
      </div>
      <div className="planes-phone">
        <PlanesSummary m={m} />
        <p className="fine muted" style={{ marginTop: 8 }}>
          {measurementCaption(m)}
        </p>
      </div>
    </>
  );
}

/** out_of_range or far_building: show what was measured and ask whether it's the right house. */
function ConfirmState({ estimate, m }: { estimate: EstimateView; m: Measurements }) {
  const question =
    estimate.reason === "far_building"
      ? "The building we measured is set back from your address point, so it may be a neighbor's house or an outbuilding. Is this your house?"
      : `The roof we measured is ${formatSqft(m.totalAreaSqft)} (${formatSquares(m.squares)} squares), ${
          m.squares < 8 ? "smaller" : "larger"
        } than a typical house, so it may be the wrong building. Is this your house?`;
  return (
    <main id="main" className="container estimate-main">
      <TitleRow title="Is this your house?" estimate={estimate} />
      <TrackOnMount events={["measured"]} props={{ confirm: estimate.reason }} />
      <div className="estimate-grid">
        <div className="estimate-left">
          <MeasuredRoof m={m} mapsKey={process.env.GOOGLE_MAPS_API_KEY || null} />
        </div>
        <div className="estimate-right">
          <section className="sheet state-panel" aria-label="Confirm your house">
            <h2 className="h2-sheet">Check the building</h2>
            <ConfirmBuilding placeId={estimate.placeId} currentRoof={estimate.currentRoof} question={question} />
          </section>
        </div>
      </div>
    </main>
  );
}

function FallbackState({ estimate }: { estimate: EstimateView }) {
  const intro =
    "We couldn't measure this roof from satellite data. Answer a few questions and we'll estimate from your home's size instead.";
  return (
    <main id="main" className="container estimate-main">
      <TitleRow title="Tell us about your home" estimate={estimate} />
      <TrackOnMount events={["fallback_shown"]} props={{ reason: estimate.reason }} />
      <section className="panel state-panel" aria-label="Home size questions">
        <p>{intro}</p>
        <p className="hint">
          Without satellite measurements each range is wider. You still don&apos;t need to give us any contact details.
        </p>
        <FallbackForm placeId={estimate.placeId} currentRoof={estimate.currentRoof} />
      </section>
    </main>
  );
}

export default async function EstimatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const estimate = await getEstimateView(id);
  if (!estimate) notFound();

  if (isExpired(estimate)) return <ExpiredState estimate={estimate} />;
  if (estimate.needsFallback) {
    if (estimate.reason && CONFIRMABLE_REASONS.has(estimate.reason) && estimate.measurements?.source === "solar")
      return <ConfirmState estimate={estimate} m={estimate.measurements} />;
    return <FallbackState estimate={estimate} />;
  }
  if (!estimate.measurements || !estimate.drivers) return <ExpiredState estimate={estimate} />;

  const m = estimate.measurements;
  const drivers = estimate.drivers;
  const solar = m.source === "solar";
  const mapsKey = process.env.GOOGLE_MAPS_API_KEY || null;

  return (
    <main id="main" className="container estimate-main">
      <TitleRow title={solar ? "Your roof, measured" : "Your roof, estimated"} estimate={estimate} />
      <TrackOnMount
        events={solar ? ["measured", "estimate_shown"] : ["estimate_shown"]}
        props={{ covered: estimate.coverage?.covered === true, confidence: drivers.confidence, source: m.source }}
      />
      <div className="estimate-grid">
        <div className="estimate-left">
          {solar ? (
            <MeasuredRoof m={m} mapsKey={mapsKey} />
          ) : (
            <HomeSizeSummary m={m} />
          )}
          <CurrentRoofSelect placeId={estimate.placeId} value={estimate.currentRoof} />
        </div>
        <div className="estimate-right">
          <EstimateSheet estimate={estimate} drivers={drivers} measurements={m} />
        </div>
      </div>
    </main>
  );
}
