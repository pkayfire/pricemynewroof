import Link from "next/link";
import { referralDisclosure } from "@/lib/site/copy";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <nav aria-label="Footer">
          <ul className="footer-links">
            <li>
              <Link href="/how-we-estimate">How we estimate</Link>
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
      </div>
    </footer>
  );
}
