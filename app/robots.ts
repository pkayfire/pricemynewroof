import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site/config";

// Ad and search crawlers may read every public page. Estimate pages contain home addresses and
// admin is private (docs/SPEC.md Routes).
const DISALLOW = ["/estimate/", "/admin/"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: ["OAI-AdsBot", "OAI-SearchBot"], allow: "/", disallow: DISALLOW },
      { userAgent: "*", allow: "/", disallow: DISALLOW },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
