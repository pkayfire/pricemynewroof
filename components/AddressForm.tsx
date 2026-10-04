"use client";

// Landing address field: Places API (New) autocomplete via the Maps JS API, then POST /api/estimate.
// The Maps script loads only after the page is idle (or on first focus) so it never competes
// with the hero for LCP.
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { loadPlacesLibrary } from "@/lib/google/maps-loader";
import { postEstimate, estimateErrorMessage } from "@/lib/api/client";

type LibState = "idle" | "loading" | "ready" | "error";
interface Suggestion {
  placeId: string;
  text: string;
}

const MIN_CHARS = 3;
const DEBOUNCE_MS = 200;

export function AddressForm({ apiKey }: { apiKey: string | null }) {
  const router = useRouter();
  const ids = useId();
  const inputId = `${ids}-address`;
  const listId = `${ids}-list`;
  const hintId = `${ids}-hint`;
  const errorId = `${ids}-error`;

  const [lib, setLib] = useState<LibState>("idle");
  const [focused, setFocused] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [selected, setSelected] = useState<Suggestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const placesRef = useRef<google.maps.PlacesLibrary | null>(null);
  const tokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const requestSeq = useRef(0);

  const loadLib = useCallback(() => {
    if (!apiKey) {
      setLib("error");
      return;
    }
    setLib((s) => (s === "idle" ? "loading" : s));
    loadPlacesLibrary(apiKey)
      .then((places) => {
        placesRef.current = places;
        setLib("ready");
      })
      .catch(() => setLib("error"));
  }, [apiKey]);

  // Load after the hero has rendered and the page is idle.
  useEffect(() => {
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    let idleId: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const start = () => {
      if (w.requestIdleCallback) idleId = w.requestIdleCallback(loadLib, { timeout: 3000 });
      else timer = setTimeout(loadLib, 1500);
    };
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
    return () => {
      window.removeEventListener("load", start);
      if (idleId !== undefined) w.cancelIdleCallback?.(idleId);
      if (timer) clearTimeout(timer);
    };
  }, [loadLib]);

  // Fetch suggestions as the user types.
  useEffect(() => {
    const places = placesRef.current;
    if (lib !== "ready" || !places || selected?.text === query) return;
    const input = query.trim();
    if (input.length < MIN_CHARS) return; // cleared in onChange
    const seq = ++requestSeq.current;
    const t = setTimeout(async () => {
      try {
        tokenRef.current ??= new places.AutocompleteSessionToken();
        const { suggestions: found } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input,
          sessionToken: tokenRef.current,
          includedRegionCodes: ["us"],
        });
        if (seq !== requestSeq.current) return;
        const list = found
          .map((s) => s.placePrediction)
          .filter((p): p is google.maps.places.PlacePrediction => p !== null)
          .slice(0, 5)
          .map((p) => ({ placeId: p.placeId, text: p.text.toString() }));
        setSuggestions(list);
        setActive(-1);
        setOpen(list.length > 0);
      } catch {
        if (seq === requestSeq.current) {
          setSuggestions([]);
          setOpen(false);
        }
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, lib, selected]);

  function choose(s: Suggestion) {
    setSelected(s);
    setQuery(s.text);
    setOpen(false);
    setSuggestions([]);
    setError(null);
    tokenRef.current = null; // a new session for the next search
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!selected || selected.text !== query) {
      if (lib === "error") setError("Address search isn't available right now. Refresh the page and try again.");
      else if (!query.trim()) setError("Enter your home address.");
      else setError("Choose your address from the list as you type.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await postEstimate({ placeId: selected.placeId });
    if (result.ok) {
      router.push(`/estimate/${encodeURIComponent(result.data.estimateId)}`);
      return;
    }
    setSubmitting(false);
    setError(estimateErrorMessage(result.status));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      choose(suggestions[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  let hint = "Free. You don't need to give us any contact details to see your estimate.";
  if (focused && lib === "loading") hint = "Loading address suggestions…";
  if (lib === "error") hint = "Address suggestions couldn't load. Refresh the page to try again.";
  if (submitting) hint = "Measuring your roof…";

  return (
    <form className="address-form" aria-label="Find your roof" onSubmit={onSubmit} noValidate>
      <label htmlFor={inputId} className="label">
        Your home address
      </label>
      <div className="address-row">
        <div className="address-combo">
          <input
            id={inputId}
            className="input input-address"
            type="text"
            name="address"
            autoComplete="off"
            placeholder="Start typing an address"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={listId}
            aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
            aria-describedby={error ? `${errorId} ${hintId}` : hintId}
            aria-invalid={error ? true : undefined}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setError(null);
              if (e.target.value.trim().length < MIN_CHARS) {
                setSuggestions([]);
                setOpen(false);
              }
            }}
            onFocus={() => {
              setFocused(true);
              if (lib === "idle") loadLib();
              if (suggestions.length) setOpen(true);
            }}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            onKeyDown={onKeyDown}
          />
          {open && (
            <ul id={listId} role="listbox" className="suggestions" aria-label="Address suggestions">
              {suggestions.map((s, i) => (
                <li
                  key={s.placeId}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  className="suggestion"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(s);
                  }}
                >
                  {s.text}
                </li>
              ))}
              {/* DECISION: text attribution; swap for Google's "powered by Google" logo asset before launch. */}
              <li role="presentation" className="suggestions-attribution">
                Powered by Google
              </li>
            </ul>
          )}
        </div>
        <button type="submit" className="btn btn-primary" aria-disabled={submitting || undefined}>
          Measure my roof
        </button>
      </div>
      {error && (
        <p id={errorId} className="error" role="alert">
          {error}
        </p>
      )}
      <p id={hintId} className="hint" aria-live="polite">
        {hint}
      </p>
    </form>
  );
}
