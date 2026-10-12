"use client";
import Link from "next/link";
import { track } from "@/lib/analytics/client";

/** The quote CTA. Records which placement was clicked (top bar or estimate sheet). */
export function QuoteLink({ estimateId, position, className }: { estimateId: string; position: "top" | "sheet"; className: string }) {
  return (
    <Link
      href={`/estimate/${encodeURIComponent(estimateId)}/quote`}
      className={className}
      onClick={() => track("quote_click", { position })}
    >
      Request quotes from local roofers
    </Link>
  );
}
