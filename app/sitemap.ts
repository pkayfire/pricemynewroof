import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site/config";

/** Public pages only; estimate pages are never listed (they contain a home address). */
const PUBLIC_PATHS = ["/", "/about", "/contact", "/how-we-estimate", "/privacy", "/terms", "/do-not-sell"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((p) => ({
    url: `${SITE_URL}${p === "/" ? "" : p}`,
    changeFrequency: p === "/" || p === "/how-we-estimate" ? "monthly" : "yearly",
    priority: p === "/" ? 1 : 0.5,
  }));
}
