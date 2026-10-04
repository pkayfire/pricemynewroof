// Shared frame for the privacy policy, terms and do-not-sell pages.
// LEGAL DRAFT: all three are drafts pending legal review; bracketed placeholders must be filled in by the owner.

export const LEGAL_ENTITY = "[LEGAL ENTITY NAME]";
export const CONTACT_EMAIL = "[CONTACT EMAIL]";
export const EFFECTIVE_DATE = "[EFFECTIVE DATE]";
export const GOVERNING_STATE = "[GOVERNING LAW STATE]";

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
