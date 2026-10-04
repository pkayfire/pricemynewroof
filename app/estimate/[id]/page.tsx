import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Measurements, StoredEstimate } from "@/lib/api/types";
import { getStoredEstimate, isExpired } from "@/lib/estimates/source";
import { formatInt, formatSqft, formatSquares } from "@/lib/format";
import { RoofMap } from "@/components/estimate/RoofMap";
import { MeasurementTable, PlanesSummary, measurementCaption } from "@/components/estimate/MeasurementTable";
import { CurrentRoofSelect } from "@/components/estimate/CurrentRoofSelect";
import { EstimateSheet } from "@/components/estimate/EstimateSheet";
import { FallbackForm } from "@/components/estimate/FallbackForm";
import { MeasureAgainButton } from "@/components/estimate/MeasureAgainButton";

// Contains a home address: never indexed, never in the sitemap (docs/SPEC.md Routes).
export const metadata: Metadata = {
  title: "Your roof estimate",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

function TitleRow({ title, estimate }: { title: string; estimate: StoredEstimate }) {
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
          <td>{h.stories >= 3 ? "3 or more" : h.stories}</td>
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

function ExpiredState({ estimate }: { estimate: StoredEstimate }) {
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

function FallbackState({ estimate }: { estimate: StoredEstimate }) {
  const intro =
    estimate.reason === "out_of_range"
      ? "The roof we found doesn't look like a single house, so it may be the wrong building. Answer a few questions and we'll estimate from your home's size instead."
      : "We couldn't measure this roof from satellite data. Answer a few questions and we'll estimate from your home's size instead.";
  return (
    <main id="main" className="container estimate-main">
      <TitleRow title="Tell us about your home" estimate={estimate} />
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
  const estimate = await getStoredEstimate(id);
  if (!estimate) notFound();

  if (estimate.needsFallback) return <FallbackState estimate={estimate} />;
  if (isExpired(estimate) || !estimate.measurements || !estimate.drivers) return <ExpiredState estimate={estimate} />;

  const m = estimate.measurements;
  const drivers = estimate.drivers;
  const solar = m.source === "solar";
  const mapsKey = process.env.GOOGLE_MAPS_API_KEY || null;

  return (
    <main id="main" className="container estimate-main">
      <TitleRow title={solar ? "Your roof, measured" : "Your roof, estimated"} estimate={estimate} />
      <div className="estimate-grid">
        <div className="estimate-left">
          {solar ? (
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
