// Browser-side funnel tracking: session ID, the sessionStorage copy of attribution, events to
// POST /api/events, and the OpenAI Pixel (only when loaded, i.e. enabled and not opted out).
// Never throws; tracking must not break the page.
import {
  ATTRIBUTION_COOKIE,
  ATTRIBUTION_STORAGE_KEY,
  SESSION_COOKIE,
  type ClientEvent,
} from "@/lib/api/contracts";
import { PIXEL_EVENTS } from "@/lib/openai-ads/pixel-events";
import { browserOptedOut } from "@/lib/privacy/client";

type Props = Record<string, string | number | boolean | null>;

const SESSION_IDLE_S = 30 * 60;

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  for (const part of document.cookie.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) {
      try {
        return decodeURIComponent(v.join("="));
      } catch {
        return v.join("=");
      }
    }
  }
  return null;
}

/** The pmnr_sid session (set and rolled by proxy.ts); created here only if the cookie is missing. */
export function sessionId(): string {
  const existing = readCookie(SESSION_COOKIE);
  if (existing && /^[A-Za-z0-9_-]{8,128}$/.test(existing)) return existing;
  const id = crypto.randomUUID();
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${SESSION_COOKIE}=${id}; Path=/; Max-Age=${SESSION_IDLE_S}; SameSite=Lax${secure}`;
  return id;
}

/** Mirrors the pmnr_attr cookie into sessionStorage (docs/SPEC.md, Tracking and attribution). */
export function mirrorAttribution(): void {
  try {
    const value = readCookie(ATTRIBUTION_COOKIE);
    if (value && sessionStorage.getItem(ATTRIBUTION_STORAGE_KEY) !== value) sessionStorage.setItem(ATTRIBUTION_STORAGE_KEY, value);
  } catch {
    // Storage can be unavailable (private mode, blocked); the cookie still carries attribution.
  }
}

type Oaiq = (cmd: string, ...args: unknown[]) => void;

function pixel(name: ClientEvent, props: Props): void {
  const map = PIXEL_EVENTS[name];
  const oaiq = (window as unknown as { oaiq?: Oaiq }).oaiq;
  if (!map || !oaiq || browserOptedOut()) return;
  // A duplicate quote request is the same lead again: don't count a second conversion.
  if (name === "form_submit" && props.duplicate === true) return;
  try {
    const data = map.data ?? (map.name === "custom" ? { type: "custom" } : { type: "contents" });
    oaiq("measure", map.name, data, { ...(map.custom ? { custom_event_name: map.custom } : {}), ...(props.event_id ? { event_id: props.event_id } : {}) });
  } catch {
    // ignore
  }
}

/** Records a funnel event. */
export function track(name: ClientEvent, props: Props = {}): void {
  if (typeof window === "undefined") return;
  try {
    const body = JSON.stringify({ sessionId: sessionId(), name, props });
    void fetch("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
  } catch {
    // ignore
  }
  pixel(name, props);
}
