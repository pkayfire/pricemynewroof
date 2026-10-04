import { describe, expect, it } from "vitest";
import { validateQuote } from "@/components/quote/QuoteForm";
import { nextSteps, referralSentence } from "@/lib/site/copy";

const ok = { name: "Pat Example", phone: "(602) 555-0123", email: "pat@example.com", address: "100 Example Way", timing: "asap" as const, consent: true };

describe("quote form validation", () => {
  it("accepts a complete form", () => {
    expect(validateQuote(ok)).toEqual({});
  });

  it("flags each missing or invalid field, including an unchecked consent box", () => {
    expect(Object.keys(validateQuote({ name: "", phone: "555-0123", email: "x", address: "", timing: null, consent: false })).sort()).toEqual(
      ["address", "consent", "email", "name", "phone", "timing"],
    );
    expect(validateQuote({ ...ok, phone: "+44 20 7946 0958" })).toHaveProperty("phone");
  });
});

describe("manual-mode copy", () => {
  it("says a person forwards the request within one business day, with no payment claim", () => {
    expect(nextSteps("manual")[0]).toMatch(/A person at Price My New Roof .* passes it to a local roofer within one business day/);
    expect(referralSentence("manual", false)).not.toMatch(/pay/i);
    expect(nextSteps("none")[0]).toMatch(/not being forwarded/);
  });
});
