import { describe, expect, it } from "vitest";
import { CONTACT_EMAIL, LEGAL_ENTITY } from "@/components/legal/LegalPage";
import { BUSINESS, businessLine } from "@/lib/site/business";

describe("business identity", () => {
  it("uses the LLC's registered name and a domain email everywhere", () => {
    expect(BUSINESS.legalName).toBe("PriceMyNewRoof, LLC");
    expect(LEGAL_ENTITY).toBe(BUSINESS.legalName);
    expect(CONTACT_EMAIL).toBe(BUSINESS.email);
    expect(BUSINESS.email).toMatch(/@pricemynewroof\.com$/);
  });

  it("builds the footer line from the name and, when set, the address", () => {
    expect(businessLine()).toContain("PriceMyNewRoof, LLC");
  });
});
