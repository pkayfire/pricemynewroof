"use client";

// Site-wide tracking: page_view on every route, the sessionStorage copy of attribution, and the
// OpenAI Pixel loader. The pixel loads only when enabled (OPENAI_PIXEL_ID and OPENAI_CAPI_TOKEN
// set) and the browser hasn't opted out (Global Privacy Control or a do-not-sell request).
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { mirrorAttribution, track } from "@/lib/analytics/client";
import type { PixelConfig } from "@/lib/openai-ads/pixel";
import { browserOptedOut } from "@/lib/privacy/client";

type Oaiq = ((...args: unknown[]) => void) & { q?: unknown[][] };

function loadPixel(config: PixelConfig) {
  if (!config.enabled || browserOptedOut()) return;
  const w = window as unknown as { oaiq?: Oaiq };
  if (w.oaiq) return;
  // Queue calls until the SDK loads (it drains oaiq.q).
  const q: Oaiq = (...args: unknown[]) => {
    (q.q ??= []).push(args);
  };
  w.oaiq = q;
  q("init", { pixelId: config.pixelId });
  const s = document.createElement("script");
  s.async = true;
  s.src = config.scriptSrc;
  document.head.appendChild(s);
}

export function Analytics({ pixel }: { pixel: PixelConfig }) {
  const pathname = usePathname();

  useEffect(() => {
    loadPixel(pixel);
  }, [pixel]);

  useEffect(() => {
    // Admin pages are not part of the funnel.
    if (pathname.startsWith("/admin")) return;
    mirrorAttribution();
    track("page_view", { path: pathname.startsWith("/estimate/") ? "/estimate/[id]" + pathname.replace(/^\/estimate\/[^/]+/, "") : pathname });
  }, [pathname]);

  return null;
}
