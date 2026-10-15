"use client";

// A Next.js link that records link_click {target, position, estimate_id?} before navigating, so we
// can see whether visitors leave the estimate for pages like How we estimate.
import Link from "next/link";
import type { ComponentProps } from "react";
import { track } from "@/lib/analytics/client";

export function TrackedLink({
  target,
  position,
  estimateId,
  onClick,
  ...props
}: ComponentProps<typeof Link> & { target: string; position: string; estimateId?: string }) {
  return (
    <Link
      {...props}
      onClick={(e) => {
        track("link_click", { target, position, ...(estimateId ? { estimate_id: estimateId } : {}) });
        onClick?.(e);
      }}
    />
  );
}
