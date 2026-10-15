import Link from "next/link";
import { TrackedLink } from "./analytics/TrackedLink";
import { BrandMark } from "./BrandMark";
import { SITE_NAME } from "@/lib/site/config";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container">
        <Link href="/" className="brand" aria-label={`${SITE_NAME}, home`}>
          <BrandMark />
          <span className="brand-name">{SITE_NAME}</span>
        </Link>
        <TrackedLink href="/how-we-estimate" className="header-link" target="how_we_estimate" position="header">
          How we estimate
        </TrackedLink>
      </div>
    </header>
  );
}
