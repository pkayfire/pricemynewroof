"use client";

// Email-this-estimate form, used where roofers aren't available and after the call test button.
import { useId, useState } from "react";
import Link from "next/link";
import { postJson } from "@/lib/api/client";
import { track } from "@/lib/analytics/client";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** "Email me this estimate", with an opt-in to hear when roofers are available (notify_when_covered). */
export function EmailEstimateForm({ estimateId, notifyLabel, source }: { estimateId: string; notifyLabel: string; source?: string }) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [notify, setNotify] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "sending") return;
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setError("Enter an email address like name@example.com.");
      return;
    }
    setError(null);
    setState("sending");
    const r = await postJson<{ ok: boolean }>("/api/email-estimate", {
      estimateId,
      email: trimmed,
      notifyWhenCovered: notify,
    });
    if (r.ok) {
      setState("sent");
      track("email_estimate", { notify_when_covered: notify, ...(source ? { source } : {}) });
    }
    else {
      setState("idle");
      setError("We couldn't send that just now. Please try again.");
    }
  }

  return (
    <>
      {state === "sent" ? (
        <p className="note" role="status">
          <strong>Thanks.</strong> We&apos;ll email this estimate to {email.trim()}
          {notify ? ", and let you know when roofers are available." : "."}
        </p>
      ) : (
        <form onSubmit={onSubmit} noValidate>
          <div className="field">
            <label htmlFor={`${id}-email`} className="label">
              Email me this estimate
            </label>
            <input
              id={`${id}-email`}
              className="input"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-error` : undefined}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <label className="checkbox">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
            <span>{notifyLabel}</span>
          </label>
          {error && (
            <p id={`${id}-error`} className="error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary btn-block" aria-disabled={state === "sending" || undefined}>
            {state === "sending" ? "Sending…" : "Email my estimate"}
          </button>
          <p className="fine muted">
            We use your email only to send this estimate and, if you tick the box, one message when roofers are
            available. See our <Link href="/privacy">privacy policy</Link>.
          </p>
        </form>
      )}
    </>
  );
}
