import type { Measurements } from "@/lib/api/types";
import { compassFromAzimuth, formatImageryDate, formatSqft, formatSquares } from "@/lib/format";

export function measurementCaption(m: Measurements): string {
  const date = formatImageryDate(m.imageryDate);
  const imagery = date ? `imagery from ${date}` : "imagery date not reported";
  return `Measured from Google satellite data, ${imagery}. Labels sit at the center of each plane; arrows point downhill.`;
}

export function MeasurementTable({ m, captionHidden = false }: { m: Measurements; captionHidden?: boolean }) {
  const otherCount = m.other?.count ?? 0;
  return (
    <table className="measure-table">
      <caption className={captionHidden ? "visually-hidden" : undefined}>{measurementCaption(m)}</caption>
      <thead>
        <tr>
          <th scope="col">Plane</th>
          <th scope="col">Pitch</th>
          <th scope="col">Slopes toward</th>
          <th scope="col" className="area">
            Area
          </th>
        </tr>
      </thead>
      <tbody>
        {m.segments.map((s) => (
          <tr key={s.letter}>
            <th scope="row" className="plane-letter">
              {s.letter}
            </th>
            <td className="pitch">{s.pitch}</td>
            <td className="dir">{s.compass === null ? "Flat" : (s.compass ?? compassFromAzimuth(s.azimuth))}</td>
            <td className="area">{formatSqft(s.areaSqft)}</td>
          </tr>
        ))}
        {m.other && otherCount > 0 && (
          <tr>
            <th scope="row" className="other-label">
              Other
            </th>
            <td colSpan={2} className="other-label">
              {otherCount === 1 ? "1 small plane" : `${otherCount} small planes`} under 50 sq ft
            </td>
            <td className="area">{formatSqft(m.other.areaSqft)}</td>
          </tr>
        )}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row" colSpan={3}>
            Total
          </th>
          <td className="area">
            {formatSqft(m.totalAreaSqft)} ({formatSquares(m.squares)} squares)
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

/** Phone: a one-line summary that opens the full table ("All planes"), as in phone-estimate.html. */
export function PlanesSummary({ m }: { m: Measurements }) {
  const n = m.segments.length;
  return (
    <details className="planes-summary">
      <summary>
        <span>
          <strong>{formatSqft(m.totalAreaSqft)}</strong> across {n} main {n === 1 ? "plane" : "planes"}
          {m.maxPitch && (
            <>
              , up to <span className="pitch-inline">{m.maxPitch}</span>
            </>
          )}
        </span>
        <span className="toggle">
          <span className="toggle-closed">All planes</span>
          <span className="toggle-open">Hide planes</span>
        </span>
      </summary>
      <MeasurementTable m={m} captionHidden />
    </details>
  );
}
