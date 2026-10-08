// Shared frame for the privacy policy, terms and do-not-sell pages. Business identity comes from
// lib/site/business.ts. Legal review is still owed before scaling ad spend (docs/SPEC.md).
import { BUSINESS } from "@/lib/site/business";

export const LEGAL_ENTITY = BUSINESS.legalName;
export const CONTACT_EMAIL = BUSINESS.email;
export const EFFECTIVE_DATE = "October 3, 2026";
export const LAST_UPDATED = "October 7, 2026";
export const GOVERNING_STATE = "California";

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main id="main" className="container prose-page">
      <article className="prose">
        <h1 className="h1-page">{title}</h1>
        <p className="small muted">Effective {EFFECTIVE_DATE}. Last updated {LAST_UPDATED}.</p>
        {children}
      </article>
    </main>
  );
}
