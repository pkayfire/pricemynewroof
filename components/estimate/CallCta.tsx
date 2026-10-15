"use client";

// The call CTA (docs/SPEC.md Build decisions, call test). With a tracking number it dials it.
// Without one (the Oct 12 call test, before Service Direct) the click is recorded as call_click and
// the lead_created conversion, then an honest note says calls aren't open yet and offers the
// estimate by email. Nothing is shared with roofers either way.
import { useState } from "react";
import { track } from "@/lib/analytics/client";
import { callEventId } from "@/lib/openai-ads/event-id";
import { EmailEstimateForm } from "./EmailEstimateForm";

export const CALL_CTA = "Call for exact quotes";
/** Shown under the button. Both are true of a call whether or not a roofer is booked. */
export const CALL_NOTE = "Free call. No obligation.";
/** Recorded on call_click so results can be split by CTA copy (v1: Oct 12, v2: Oct 14 value copy). */
export const CALL_CTA_VERSION = "v2";

function PhoneIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />
    </svg>
  );
}

export function CallCta({
  estimateId,
  trackingNumber,
  position,
  className,
}: {
  estimateId: string;
  trackingNumber: string | null;
  position: "top" | "sheet";
  className: string;
}) {
  const [clicked, setClicked] = useState(false);
  const record = () =>
    track("call_click", { position, event_id: callEventId(estimateId), has_number: trackingNumber !== null, cta_version: CALL_CTA_VERSION });

  if (trackingNumber)
    return (
      <div className="call-cta-wrap">
        <a href={`tel:${trackingNumber}`} className={className} onClick={record}>
          <PhoneIcon />
          {CALL_CTA}
        </a>
        <p className="call-note">{CALL_NOTE}</p>
      </div>
    );

  if (clicked)
    return (
      <div className="call-pending" role="status">
        <p className="call-pending-title">Roofer calls aren&apos;t open yet</p>
        <p className="referral">
          Thanks for your interest. We&apos;re still setting up calls with local roofers, and nothing has been shared with
          anyone. We can email you this estimate so you have it for later.
        </p>
        <EmailEstimateForm estimateId={estimateId} notifyLabel="Also tell me when I can call local roofers." source="call_test" />
      </div>
    );

  return (
    <div className="call-cta-wrap">
      <button
        type="button"
        className={className}
        onClick={() => {
          record();
          setClicked(true);
        }}
      >
        <PhoneIcon />
        {CALL_CTA}
      </button>
      <p className="call-note">{CALL_NOTE}</p>
    </div>
  );
}
