"use client";

// Records funnel events once when a server-rendered state appears (e.g. estimate_shown).
import { useEffect } from "react";
import type { ClientEvent } from "@/lib/api/contracts";
import { track } from "@/lib/analytics/client";

export function TrackOnMount({ events, props }: { events: ClientEvent[]; props?: Record<string, string | number | boolean | null> }) {
  const key = JSON.stringify([events, props]);
  useEffect(() => {
    const [evts, p] = JSON.parse(key) as [ClientEvent[], Record<string, string | number | boolean | null> | undefined];
    for (const e of evts) track(e, p ?? {});
  }, [key]);
  return null;
}
