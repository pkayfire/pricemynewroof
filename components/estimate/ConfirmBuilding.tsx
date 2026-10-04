"use client";

// Wrong-building check (out_of_range or far_building): the measured roof is shown, and the user
// either confirms it ("Yes, this is my house" → POST with confirmMeasurements: true) or answers the
// home-size questions instead.
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CurrentRoof } from "@/lib/api/types";
import { estimateErrorMessage, postEstimate } from "@/lib/api/client";
import { FallbackForm } from "./FallbackForm";

export function ConfirmBuilding({
  placeId,
  currentRoof,
  question,
}: {
  placeId: string;
  currentRoof: CurrentRoof | null;
  question: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"ask" | "form">("ask");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await postEstimate({ placeId, confirmMeasurements: true, ...(currentRoof ? { currentRoof } : {}) });
    if (r.ok) {
      router.push(`/estimate/${encodeURIComponent(r.data.estimateId)}`);
      return;
    }
    setBusy(false);
    setError(estimateErrorMessage(r.status));
  }

  if (mode === "form") {
    return (
      <>
        <p>Answer a few questions and we&apos;ll estimate from your home&apos;s size instead. Each range will be wider.</p>
        <FallbackForm placeId={placeId} currentRoof={currentRoof} />
        <p>
          <button type="button" className="link-button" onClick={() => setMode("ask")}>
            Back to the measured roof
          </button>
        </p>
      </>
    );
  }

  return (
    <>
      <p>{question}</p>
      <div className="confirm-actions">
        <button type="button" className="btn btn-primary" onClick={confirm} aria-disabled={busy || undefined}>
          {busy ? "Estimating…" : "Yes, this is my house"}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setMode("form")} disabled={busy}>
          Answer a few questions instead
        </button>
      </div>
      <p className="hint">
        If you confirm, we price the roof shown and widen each range a little, since we couldn&apos;t check it
        against your address.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
