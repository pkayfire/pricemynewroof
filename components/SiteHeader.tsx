import Link from "next/link";
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
        <Link href="/how-we-estimate" className="header-link">
          How we estimate
        </Link>
      </div>
    </header>
  );
}
