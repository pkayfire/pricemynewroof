import type { Drivers, EstimateOption, EstimateView, Measurements, OptionId } from "@/lib/api/types";
import {
  callPitchHeading,
  formatRange,
  formatShare,
  oldImageryNote,
  wideningNote,
  sheetSubtitle,
} from "@/lib/format";
import { referralSentence } from "@/lib/site/copy";
import { Explanation } from "./Explanation";
import { NoCoveragePanel } from "./NoCoveragePanel";
import { TrackedLink } from "@/components/analytics/TrackedLink";
import { CallCta, StickyCallBar } from "./CallCta";
import { TimelineCta } from "./TimelineCta";
import { QuoteLink } from "./QuoteLink";

export const OTHER_LEGEND = "Tear-off, overhead, steep-roof work and permit";

/** Shown when the engine gives an option no note of its own (accepted option-note copy). */
const DEFAULT_NOTES: Record<OptionId, string | null> = {
  architectural_shingle: "Full tear-off, new underlayment and architectural (dimensional) asphalt shingles.",
  concrete_tile: "Full tear-off, new tile and underlayment.",
  lift_and_relay: null,
};

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

function Notes({ drivers, imageryDate }: { drivers: Drivers; imageryDate: string | null }) {
  const wider = wideningNote(drivers.fallbacks);
  const old = oldImageryNote(drivers.fallbacks, imageryDate);
  // DECISION (owner, Oct 12): no generic "Low confidence" banner; the specific notes below say why a
  // range is wider or the imagery older. Confidence stays in the data and the API.
  if (!wider && !old) return null;
  return (
    <div className="sheet-notes">
      {wider && (
        <p className="note">
          <strong>Wider range.</strong> {wider}
        </p>
      )}
      {old && (
        <p className="note">
          <strong>Older imagery.</strong> {old}
        </p>
      )}
    </div>
  );
}

/** The primary CTA for a covered estimate: the call button when calls lead (call test), else the quote form. */
function PrimaryCta({ estimate, position, className }: { estimate: EstimateView; position: "top" | "sheet"; className: string }) {
  const tracking = estimate.coverage?.trackingNumber ?? null;
  if (estimate.coverage?.leadTypes[0] === "call")
    return <CallCta estimateId={estimate.estimateId} trackingNumber={tracking} position={position} className={className} />;
  return <QuoteLink estimateId={estimate.estimateId} position={position} className={className} />;
}

function QuoteCta({ estimate }: { estimate: EstimateView }) {
  const types = estimate.coverage?.leadTypes ?? [];
  const tracking = estimate.coverage?.trackingNumber ?? null;
  return (
    <>
      {types[0] === "call" ? (
        <TimelineCta
          estimateId={estimate.estimateId}
          trackingNumber={tracking}
          pitch={
            <div className="call-pitch">
              <h3 className="h3">{callPitchHeading(estimate.options[0])}</h3>
              <p>
                This estimate can&apos;t see your decking, underlayment or flashing. On the call, a local roofer asks a few
                questions about your roof and, if you want, sets up a visit to check those and give you a firm quote.
              </p>
            </div>
          }
        />
      ) : (
        <PrimaryCta estimate={estimate} position="sheet" className="btn btn-primary btn-block" />
      )}
      {types[0] !== "call" && types.includes("call") && tracking && (
        <CallCta estimateId={estimate.estimateId} trackingNumber={tracking} position="sheet" className="btn btn-secondary btn-block" />
      )}
      {/* DECISION (Oct 14): the referral disclosure lives in the site footer; the form keeps its forwarding sentence. */}
      {types.includes("form") && <p className="referral">{referralSentence()}</p>}
    </>
  );
}

export function EstimateSheet({
  estimate,
  drivers,
  measurements,
}: {
  estimate: EstimateView;
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
      <Notes drivers={drivers} imageryDate={measurements.imageryDate} />
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }} aria-label="Roof options">
        {estimate.options.map((o) => (
          <li key={o.id} className="option-row">
            <div className="option-text">
              <div className="option-name">{o.name}</div>
              {(o.note ?? DEFAULT_NOTES[o.id]) && <div className="option-note">{o.note ?? DEFAULT_NOTES[o.id]}</div>}
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
          <TrackedLink href="/how-we-estimate" target="how_we_estimate" position="sheet" estimateId={estimate.estimateId}>
            How we estimate
          </TrackedLink>
        </p>
      </div>
    </section>
  );
}

/** Quote CTA at the top of the estimate page, so it's visible without scrolling (covered areas only). */
export function TopQuoteBar({ estimate }: { estimate: EstimateView }) {
  const first = estimate.options?.[0];
  if (estimate.coverage?.covered !== true || !first) return null;
  return (
    <section className="top-quote" aria-label="Get exact quotes">
      <div className="top-quote-price">
        <div className="top-quote-label">{first.name}</div>
        <div className="top-quote-range">{formatRange(first.low, first.high)}</div>
      </div>
      <PrimaryCta estimate={estimate} position="top" className="btn btn-primary top-quote-btn" />
    </section>
  );
}

/** Phone-width call bar for the call test (covered areas whose first lead type is call). */
export function StickyCall({ estimate }: { estimate: EstimateView }) {
  const first = estimate.options?.[0];
  if (estimate.coverage?.covered !== true || estimate.coverage.leadTypes[0] !== "call" || !first) return null;
  return (
    <StickyCallBar
      estimateId={estimate.estimateId}
      trackingNumber={estimate.coverage.trackingNumber ?? null}
      label={first.name}
      range={formatRange(first.low, first.high)}
    />
  );
}
