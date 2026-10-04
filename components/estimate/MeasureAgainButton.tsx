"use client";

// Expired estimate: measure the same place again (a fresh Solar API call), or start over.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CurrentRoof } from "@/lib/api/types";
import { estimateErrorMessage, postEstimate } from "@/lib/api/client";

export function MeasureAgainButton({ placeId, currentRoof }: { placeId: string; currentRoof: CurrentRoof | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function measure() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await postEstimate({ placeId, ...(currentRoof ? { currentRoof } : {}) });
    if (r.ok) {
      router.push(`/estimate/${encodeURIComponent(r.data.estimateId)}`);
      return;
    }
    setBusy(false);
    setError(estimateErrorMessage(r.status));
  }

  return (
    <div className="field">
      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 18px", alignItems: "center" }}>
        <button type="button" className="btn btn-primary" onClick={measure} aria-disabled={busy || undefined}>
          {busy ? "Measuring…" : "Measure again"}
        </button>
        <Link href="/" className="change-address">
          Use a different address
        </Link>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
