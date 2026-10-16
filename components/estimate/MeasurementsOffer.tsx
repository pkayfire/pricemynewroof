"use client";

// Second option under the call button (Oct 15): email a link to the measured roof, for visitors who
// read the estimate but aren't ready to call. The link opens the estimate page, where the Solar
// measurements stay on the Google map (Maps Platform terms), so nothing is sent to roofers.
import { useState } from "react";
import { track } from "@/lib/analytics/client";
import { EmailEstimateForm } from "./EmailEstimateForm";

export const MEASUREMENTS_CTA = "Email me my roof measurements";
export const MEASUREMENTS_NOTE = "Roof area, pitch and number of planes, ready to share with roofers for a quick ballpark.";

export function MeasurementsOffer({ estimateId }: { estimateId: string }) {
  const [open, setOpen] = useState(false);
  if (open)
    return (
      <div className="measurements-offer">
        <EmailEstimateForm
          estimateId={estimateId}
          label="Your email"
          submitLabel="Email my measurements"
          sentLabel="your roof measurements and estimate"
          notifyLabel="Also tell me when I can call local roofers."
          source="measurements"
        />
      </div>
    );
  return (
    <div className="call-cta-wrap measurements-offer">
      <button
        type="button"
        className="btn btn-secondary btn-block"
        onClick={() => {
          track("measurements_click", { estimate_id: estimateId });
          setOpen(true);
        }}
      >
        {MEASUREMENTS_CTA}
      </button>
      <p className="call-note">{MEASUREMENTS_NOTE}</p>
    </div>
  );
}
