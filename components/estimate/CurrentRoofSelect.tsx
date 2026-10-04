"use client";

// "What's on the roof now": re-requests the estimate for the same place with the new current roof.
// The server reuses the stored measurements instead of calling the Solar API again (Build decisions).
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { CURRENT_ROOFS, type CurrentRoof } from "@/lib/api/types";
import { estimateErrorMessage, postEstimate } from "@/lib/api/client";
import { CURRENT_ROOF_LABELS } from "@/lib/format";

export function CurrentRoofSelect({ placeId, value }: { placeId: string; value: CurrentRoof | null }) {
  const router = useRouter();
  const id = useId();
  const [current, setCurrent] = useState<CurrentRoof>(value ?? "not_sure");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(next: CurrentRoof) {
    const previous = current;
    setCurrent(next);
    setBusy(true);
    setError(null);
    const r = await postEstimate({ placeId, currentRoof: next });
    if (r.ok) {
      router.replace(`/estimate/${encodeURIComponent(r.data.estimateId)}`);
      return;
    }
    setBusy(false);
    setCurrent(previous);
    setError(estimateErrorMessage(r.status));
  }

  return (
    <div className="field">
      <div className="current-roof">
        <label htmlFor={id} className="label">
          What&apos;s on the roof now
        </label>
        <select
          id={id}
          className="select"
          value={current}
          disabled={busy}
          aria-describedby={`${id}-status`}
          onChange={(e) => onChange(e.target.value as CurrentRoof)}
        >
          {CURRENT_ROOFS.map((r) => (
            <option key={r} value={r}>
              {CURRENT_ROOF_LABELS[r]}
            </option>
          ))}
        </select>
      </div>
      <p id={`${id}-status`} className="status" aria-live="polite">
        {busy ? "Updating your estimate…" : ""}
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
