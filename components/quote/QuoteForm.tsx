"use client";

// Quote request form → POST /api/lead (docs/SPEC.md Lead intake). The consent checkbox starts
// unchecked and shows the exact versioned consent text the server hashes and stores.
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { postJsonDetailed } from "@/lib/api/client";
import { TIMING_OPTIONS, type LeadRequest, type LeadResponse, type Timing } from "@/lib/api/types";
import { track } from "@/lib/analytics/client";
import { toE164US } from "@/lib/leads/phone";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Field = "name" | "phone" | "email" | "address" | "timing" | "consent";

export interface QuoteFormProps {
  estimateId: string;
  defaultAddress: string;
  consentVersion: string;
  consentText: string;
}

export function validateQuote(v: { name: string; phone: string; email: string; address: string; timing: Timing | null; consent: boolean }) {
  const e: Partial<Record<Field, string>> = {};
  if (v.name.trim().length < 2) e.name = "Enter your name.";
  if (!toE164US(v.phone)) e.phone = "Enter a 10-digit US phone number, like (555) 555-0100.";
  if (!EMAIL_RE.test(v.email.trim())) e.email = "Enter an email address like name@example.com.";
  if (v.address.trim().length < 5) e.address = "Enter the street address for the project.";
  if (!v.timing) e.timing = "Choose when you'd like the work done.";
  if (!v.consent) e.consent = "Check the box so we can pass your request to a roofer.";
  return e;
}

const SERVER_FIELDS: Record<string, Field> = { name: "name", phone: "phone", email: "email", address: "address", timing: "timing", consent: "consent" };

export function QuoteForm({ estimateId, defaultAddress, consentVersion, consentText }: QuoteFormProps) {
  const router = useRouter();
  const id = useId();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState(defaultAddress);
  const [timing, setTiming] = useState<Timing | null>(null);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const next = validateQuote({ name, phone, email, address, timing, consent });
    setErrors(next);
    setSubmitError(null);
    if (Object.keys(next).length) {
      document.getElementById(`${id}-${Object.keys(next)[0]}`)?.focus();
      return;
    }
    setBusy(true);
    const body: LeadRequest = {
      estimateId,
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      address: address.trim(),
      timing: timing!,
      consentVersion,
      consent: true,
      pageUrl: window.location.href.split("?")[0],
    };
    const r = await postJsonDetailed<LeadResponse>("/api/lead", body);
    if (r.ok) {
      track("form_submit", { duplicate: r.data.duplicate, timing: timing! });
      router.push(`/estimate/${encodeURIComponent(estimateId)}/thanks${r.data.duplicate ? "?duplicate=1" : ""}`);
      return;
    }
    setBusy(false);
    const field = r.error?.field ? SERVER_FIELDS[r.error.field] : undefined;
    if (r.status === 400 && field) {
      setErrors({ [field]: field === "phone" ? "Enter a valid US phone number." : `Check this: ${r.error?.message ?? "invalid"}` });
      return;
    }
    if (r.error?.error === "unknown_consent_version") setSubmitError("The consent wording changed. Reload the page and try again.");
    else if (r.error?.error === "not_covered") setSubmitError("We don't have partner roofers in this area yet, so we can't send this request.");
    else if (r.status === 429) setSubmitError("Too many requests from this connection. Try again in an hour.");
    else if (r.status === 0) setSubmitError("We couldn't reach our server. Check your connection and try again.");
    else setSubmitError("Something went wrong sending your request. Please try again in a minute.");
  }

  const describedBy = (k: Field, hint = false) =>
    [hint ? `${id}-${k}-hint` : "", errors[k] ? `${id}-${k}-error` : ""].filter(Boolean).join(" ") || undefined;
  const err = (k: Field) =>
    errors[k] ? (
      <p id={`${id}-${k}-error`} className="error">
        {errors[k]}
      </p>
    ) : null;

  return (
    <form onSubmit={onSubmit} noValidate aria-label="Request quotes">
      {Object.keys(errors).length > 0 && (
        <p className="error" role="alert">
          Check the {Object.keys(errors).length === 1 ? "field" : `${Object.keys(errors).length} fields`} marked below.
        </p>
      )}
      <div className="field">
        <label htmlFor={`${id}-name`} className="label">
          Name
        </label>
        <input id={`${id}-name`} className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={errors.name ? true : undefined} aria-describedby={describedBy("name")} />
        {err("name")}
      </div>
      <div className="field">
        <label htmlFor={`${id}-phone`} className="label">
          Phone
        </label>
        <input
          id={`${id}-phone`}
          className="input num"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          aria-invalid={errors.phone ? true : undefined}
          aria-describedby={describedBy("phone")}
          style={{ maxWidth: 280 }}
        />
        {err("phone")}
      </div>
      <div className="field">
        <label htmlFor={`${id}-email`} className="label">
          Email
        </label>
        <input
          id={`${id}-email`}
          className="input"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={describedBy("email")}
        />
        {err("email")}
      </div>
      <div className="field">
        <label htmlFor={`${id}-address`} className="label">
          Project address
        </label>
        <p id={`${id}-address-hint`} className="hint">
          From your estimate. Correct it if the roofer should go somewhere else, or add a unit number.
        </p>
        <input
          id={`${id}-address`}
          className="input"
          autoComplete="street-address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          aria-invalid={errors.address ? true : undefined}
          aria-describedby={describedBy("address", true)}
        />
        {err("address")}
      </div>
      <fieldset className="choice-group" aria-describedby={describedBy("timing")}>
        <legend className="label">When would you like the work done?</legend>
        {TIMING_OPTIONS.map((t, i) => (
          <label key={t.id} className="choice">
            <input
              id={i === 0 ? `${id}-timing` : undefined}
              type="radio"
              name={`${id}-timing`}
              value={t.id}
              checked={timing === t.id}
              onChange={() => setTiming(t.id)}
            />
            <span>{t.label}</span>
          </label>
        ))}
        {err("timing")}
      </fieldset>
      <div className="field">
        <label className="checkbox consent">
          <input
            id={`${id}-consent`}
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            aria-invalid={errors.consent ? true : undefined}
            aria-describedby={describedBy("consent")}
          />
          <span>{consentText}</span>
        </label>
        {err("consent")}
      </div>
      {submitError && (
        <p className="error" role="alert">
          {submitError}
        </p>
      )}
      <div>
        <button type="submit" className="btn btn-primary" aria-disabled={busy || undefined}>
          {busy ? "Sending…" : "Request quotes"}
        </button>
      </div>
    </form>
  );
}
