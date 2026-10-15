"use client";

// Engagement on the estimate page (lib/analytics/engagement.ts): scroll_depth at 25/50/75/100%,
// cta_seen when the call button in the estimate sheet is half in view, and page_time with the
// seconds the page was visible each time it's hidden (tab switch, app switch, leaving).
import { useEffect } from "react";
import { track } from "@/lib/analytics/client";
import { newMilestones, scrollPercent } from "@/lib/analytics/engagement";

export function EstimateEngagement({ estimateId }: { estimateId: string }) {
  useEffect(() => {
    let recorded = 0;
    let maxPercent = 0;
    let visibleSince: number | null = document.visibilityState === "visible" ? performance.now() : null;
    let visibleMs = 0;
    let sentSeconds = -1;

    const onScroll = () => {
      const p = scrollPercent(window.scrollY, window.innerHeight, document.documentElement.scrollHeight);
      maxPercent = Math.max(maxPercent, p);
      for (const depth of newMilestones(recorded, p)) {
        track("scroll_depth", { estimate_id: estimateId, depth });
        recorded = depth;
      }
    };

    const flush = () => {
      if (visibleSince !== null) {
        visibleMs += performance.now() - visibleSince;
        visibleSince = null;
      }
      const seconds = Math.round(visibleMs / 1000);
      if (seconds === sentSeconds) return; // pagehide right after visibilitychange: nothing new
      sentSeconds = seconds;
      track("page_time", { estimate_id: estimateId, seconds, max_depth: maxPercent });
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
      else visibleSince = performance.now();
    };

    let observer: IntersectionObserver | null = null;
    const cta = document.querySelector(".sheet-foot .btn-primary, .sheet-foot .call-pending");
    if (cta && "IntersectionObserver" in window) {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            track("cta_seen", { estimate_id: estimateId, position: "sheet" });
            observer?.disconnect();
          }
        },
        { threshold: 0.5 },
      );
      observer.observe(cta);
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      observer?.disconnect();
    };
  }, [estimateId]);
  return null;
}
