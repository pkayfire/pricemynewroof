// Shared frame for the privacy policy, terms and do-not-sell pages.
// LEGAL DRAFT: all three are drafts pending legal review (owner-supplied entity, contact, date and law state).

export const LEGAL_ENTITY = "PriceMyNewRoof";
export const CONTACT_EMAIL = "pricemynewroof@gmail.com";
export const EFFECTIVE_DATE = "October 3, 2026";
export const GOVERNING_STATE = "California";

export function DraftBanner() {
  return (
    <p className="draft-banner" role="note">
      Draft: pending legal review
    </p>
  );
}

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main id="main" className="container prose-page">
      <article className="prose">
        <DraftBanner />
        <h1 className="h1-page">{title}</h1>
        <p className="small muted">Effective {EFFECTIVE_DATE}. Last updated {EFFECTIVE_DATE}.</p>
        {children}
      </article>
    </main>
  );
}
