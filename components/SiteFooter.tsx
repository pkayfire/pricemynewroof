import Link from "next/link";
import { BUSINESS, businessLine } from "@/lib/site/business";
import { TrackedLink } from "./analytics/TrackedLink";
import { referralDisclosure } from "@/lib/site/copy";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <nav aria-label="Footer">
          <ul className="footer-links">
            <li>
              <Link href="/about">About</Link>
            </li>
            <li>
              <Link href="/contact">Contact</Link>
            </li>
            <li>
              <TrackedLink href="/how-we-estimate" target="how_we_estimate" position="footer">
                How we estimate
              </TrackedLink>
            </li>
            <li>
              <Link href="/privacy">Privacy</Link>
            </li>
            <li>
              <Link href="/terms">Terms</Link>
            </li>
            <li>
              <Link href="/do-not-sell">Do not sell or share my personal information</Link>
            </li>
          </ul>
        </nav>
        <p className="footer-note">{referralDisclosure()} Every price shown is a general estimate, not a quote.</p>
        <p className="footer-note">
          © {new Date().getFullYear()} {businessLine()} · <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>
          {BUSINESS.phone ? <> · {BUSINESS.phone}</> : null}
        </p>
      </div>
    </footer>
  );
}
