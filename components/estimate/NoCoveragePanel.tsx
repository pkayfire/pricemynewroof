"use client";

// Not covered: the estimate stays, no call or quote CTAs, nothing is shared with roofers.
// Optional "email me this estimate" plus an opt-in "tell me when roofers are available"
// (docs/SPEC.md Coverage, leads and calls).
import { EmailEstimateForm } from "./EmailEstimateForm";

export function NoCoveragePanel({ estimateId }: { estimateId: string }) {
  return (
    <div className="no-coverage">
      <h3 className="h3">No partner roofers here yet</h3>
      <p className="referral">
        We don&apos;t work with roofers in your area yet, so we can&apos;t pass on a quote request. Your estimate stays
        the same, and nothing is shared with roofers.
      </p>
      <EmailEstimateForm estimateId={estimateId} notifyLabel="Also tell me when roofers are available in my area." />
    </div>
  );
}
