import Link from "next/link";
import type { Drivers, EstimateOption, Measurements, StoredEstimate } from "@/lib/api/types";
import {
  formatRange,
  formatShare,
  imageryNote,
  lowConfidenceNote,
  sheetSubtitle,
  sourcesSentence,
} from "@/lib/format";
import { referralSentence } from "@/lib/site/copy";
import { Explanation } from "./Explanation";
import { NoCoveragePanel } from "./NoCoveragePanel";

export const OTHER_LEGEND = "Tear-off, overhead, steep-roof work and permit";

export function BreakdownBar({ drivers, options }: { drivers: Drivers; options: EstimateOption[] }) {
  const option = options.find((o) => o.id === drivers.sharesOption) ?? options[0];
  const { labor, materials, other } = drivers.shares;
  return (
    <>
      <div className="breakdown-label">Cost breakdown for {option?.name.toLowerCase() ?? "the first option"}</div>
      <div className="breakdown-bar" aria-hidden="true">
        <div className="seg-labor" style={{ width: `${labor * 100}%` }} />
        <div className="seg-materials" style={{ width: `${materials * 100}%` }} />
        <div className="seg-other" style={{ width: `${other * 100}%` }} />
      </div>
      <ul className="legend">
        <li>
          <span className="swatch seg-labor" aria-hidden="true" />
          Labor {formatShare(labor)}
        </li>
        <li>
          <span className="swatch seg-materials" aria-hidden="true" />
          Materials {formatShare(materials)}
        </li>
        <li>
          <span className="swatch seg-other" aria-hidden="true" />
          {OTHER_LEGEND} {formatShare(other)}
        </li>
      </ul>
    </>
  );
}

function Notes({ drivers }: { drivers: Drivers }) {
  const imagery = imageryNote(drivers.fallbacks);
  const low = lowConfidenceNote(drivers);
  if (!imagery && !low) return null;
  return (
    <div className="sheet-notes">
      {imagery && (
        <p className="note">
          <strong>Imagery note.</strong> {imagery}
        </p>
      )}
      {low && (
        <p className="note">
          <strong>Low confidence.</strong> {low}
        </p>
      )}
    </div>
  );
}

function QuoteCta({ estimate }: { estimate: StoredEstimate }) {
  const tracking = estimate.coverage?.trackingNumber;
  return (
    <>
      <Link
        href={`/estimate/${encodeURIComponent(estimate.estimateId)}/quote`}
        className="btn btn-primary btn-block"
      >
        Request quotes from local roofers
      </Link>
      {tracking && (
        <a href={`tel:${tracking}`} className="btn btn-secondary btn-block">
          Call for exact quotes
        </a>
      )}
      <p className="referral">
        {referralSentence()} Price My New Roof is a referral service, not a roofing contractor.
      </p>
    </>
  );
}

export function EstimateSheet({
  estimate,
  drivers,
  measurements,
}: {
  estimate: StoredEstimate;
  drivers: Drivers;
  measurements: Measurements;
}) {
  const covered = estimate.coverage?.covered === true;
  return (
    <section className="sheet" aria-labelledby="sheet-heading">
      <div className="sheet-head">
        <h2 id="sheet-heading" className="h2-sheet">
          Estimated cost to replace it
        </h2>
        <p>{sheetSubtitle(drivers)}</p>
      </div>
      <Notes drivers={drivers} />
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }} aria-label="Roof options">
        {estimate.options.map((o) => (
          <li key={o.id} className="option-row">
            <div className="option-text">
              <div className="option-name">{o.name}</div>
              {o.note && <div className="option-note">{o.note}</div>}
            </div>
            <div className="option-range">{formatRange(o.low, o.high)}</div>
          </li>
        ))}
      </ul>
      <div className="why">
        <h3 className="h3">Why this price</h3>
        <Explanation estimateId={estimate.estimateId} />
        <p className="auto-label">Written automatically from your roof&apos;s measurements.</p>
        <BreakdownBar drivers={drivers} options={estimate.options} />
      </div>
      <div className="sheet-foot">
        {covered ? <QuoteCta estimate={estimate} /> : <NoCoveragePanel estimateId={estimate.estimateId} />}
        <p className="sources">
          {sourcesSentence(drivers, measurements)} <Link href="/how-we-estimate">How we estimate</Link>
        </p>
      </div>
    </section>
  );
}
