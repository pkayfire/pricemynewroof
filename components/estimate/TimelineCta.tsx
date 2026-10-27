"use client";

// The estimate sheet's call section with the replacement timeline question (Oct 26, docs/SPEC.md
// Build decisions). Until answered, and for "Within 3 months", the call leads with the measurements
// email under it. "This year" and "Just researching" swap them, and the phone call bar steps aside.
import { useState, type ReactNode } from "react";
import { track } from "@/lib/analytics/client";
import { callFirst, TIMELINE_ANSWERS, TIMELINE_EVENT, TIMELINE_QUESTION, type TimelineAnswer } from "@/lib/site/timeline";
import { CallCta } from "./CallCta";
import { MeasurementsOffer } from "./MeasurementsOffer";

export function TimelineCta({ estimateId, trackingNumber, pitch }: { estimateId: string; trackingNumber: string | null; pitch: ReactNode }) {
  const [answer, setAnswer] = useState<TimelineAnswer | null>(null);

  const choose = (id: TimelineAnswer) => {
    if (id === answer) return;
    setAnswer(id);
    track("timeline_answer", { estimate_id: estimateId, answer: id });
    window.dispatchEvent(new CustomEvent(TIMELINE_EVENT, { detail: id }));
  };

  // One DOM order (pitch, call, measurements) so an open email form survives a changed answer; CSS
  // reorders them when the call steps back.
  const lead = callFirst(answer);
  return (
    <>
      <fieldset className="timeline">
        <legend className="label">{TIMELINE_QUESTION}</legend>
        <div className="timeline-choices">
          {TIMELINE_ANSWERS.map((a) => (
            <button key={a.id} type="button" className="timeline-choice" aria-pressed={answer === a.id} onClick={() => choose(a.id)}>
              {a.label}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="timeline-ctas" data-call-first={lead}>
        {pitch}
        <CallCta
          estimateId={estimateId}
          trackingNumber={trackingNumber}
          position="sheet"
          className={lead ? "btn btn-primary btn-block" : "btn btn-secondary btn-block"}
        />
        <MeasurementsOffer estimateId={estimateId} primary={!lead} />
      </div>
    </>
  );
}
