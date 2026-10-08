// Who operates the site. One source for the footer, About, Contact and legal pages, so the
// business identity always matches the ad account (OpenAI advertiser verification).
export const BUSINESS = {
  brand: "Price My New Roof",
  legalName: "PriceMyNewRoof, LLC",
  email: "hello@pricemynewroof.com",
  /** Business mailing address (a virtual mailbox, not a home). Shown everywhere once set. */
  mailingAddress: null as readonly string[] | null,
  /** Display form, e.g. "(555) 555-0100". Shown once set. */
  phone: null as string | null,
} as const;

/** "PriceMyNewRoof, LLC · 123 Main St, City, ST 00000" for one-line use. */
export function businessLine(): string {
  return [BUSINESS.legalName, BUSINESS.mailingAddress?.join(", ")].filter(Boolean).join(" · ");
}
