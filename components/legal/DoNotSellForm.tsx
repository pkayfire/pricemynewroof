"use client";

// California "Do not sell or share my personal information" request form → POST /api/do-not-sell.
import { useId, useState } from "react";
import { postJson } from "@/lib/api/client";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function DoNotSellForm() {
  const id = useId();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [agent, setAgent] = useState(false);
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "sending") return;
    const em = email.trim();
    const ph = phone.trim();
    if (!em && !ph) return setError("Enter the email address or phone number you used with us.");
    if (em && !EMAIL_RE.test(em)) return setError("Enter an email address like name@example.com.");
    if (ph && ph.replace(/\D/g, "").length < 10) return setError("Enter a 10-digit phone number.");
    setError(null);
    setState("sending");
    const r = await postJson<{ ok: boolean }>("/api/do-not-sell", {
      name: name.trim(),
      email: em,
      phone: ph,
      state: "CA",
      requestType: "opt_out_sale_share",
      authorizedAgent: agent,
      details: details.trim(),
    });
    if (r.ok) setState("sent");
    else {
      setState("idle");
      setError("We couldn't send your request just now. Please try again, or email us.");
    }
  }

  if (state === "sent") {
    return (
      <p className="note" role="status">
        <strong>Request received.</strong> We&apos;ll stop selling or sharing personal information linked to the
        details you gave within 15 business days, and confirm by email if you gave one.
      </p>
    );
  }

  return (
    <form className="form-stack" onSubmit={onSubmit} noValidate aria-label="Do not sell or share request">
      <div className="field">
        <label htmlFor={`${id}-name`} className="label">
          Name <span className="muted">(optional)</span>
        </label>
        <input id={`${id}-name`} className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor={`${id}-email`} className="label">
          Email address
        </label>
        <input
          id={`${id}-email`}
          className="input"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor={`${id}-phone`} className="label">
          Phone number
        </label>
        <p id={`${id}-phone-hint`} className="hint">
          Give the email, the phone number or both, as you entered them on a quote request.
        </p>
        <input
          id={`${id}-phone`}
          className="input"
          type="tel"
          autoComplete="tel"
          aria-describedby={`${id}-phone-hint`}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>
      <label className="checkbox">
        <input type="checkbox" checked={agent} onChange={(e) => setAgent(e.target.checked)} />
        <span>I&apos;m an authorized agent making this request for someone else.</span>
      </label>
      <div className="field">
        <label htmlFor={`${id}-details`} className="label">
          Anything else we should know <span className="muted">(optional)</span>
        </label>
        <textarea
          id={`${id}-details`}
          className="input"
          rows={4}
          style={{ paddingTop: 10, paddingBottom: 10 }}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
        />
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div>
        <button type="submit" className="btn btn-primary" aria-disabled={state === "sending" || undefined}>
          {state === "sending" ? "Sending…" : "Send my request"}
        </button>
      </div>
      <p className="fine muted">
        We use these details only to find your records and honor this request. You don&apos;t need an account, and we
        won&apos;t treat you differently for making it.
      </p>
    </form>
  );
}
