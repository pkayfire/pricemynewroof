"use client";

// Shown when needsFallback: home size, stories, roof shape and current roof, posted as `fallback`
// to POST /api/estimate (docs/SPEC.md Frontend; Measurement math for the fallback squares).
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { CURRENT_ROOFS, type CurrentRoof, type RoofShape } from "@/lib/api/types";
import { estimateErrorMessage, postEstimate } from "@/lib/api/client";
import { CURRENT_ROOF_LABELS } from "@/lib/format";

const SHAPES: { value: RoofShape; label: string; hint: string }[] = [
  { value: "simple", label: "Simple", hint: "One plain gable or hip roof" },
  { value: "average", label: "Average", hint: "A few wings, valleys or a dormer" },
  { value: "complex", label: "Complex", hint: "Many sections, valleys, dormers or turrets" },
];

const STORIES = [
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "4 or more" },
];

export function FallbackForm({ placeId, currentRoof }: { placeId: string; currentRoof: CurrentRoof | null }) {
  const router = useRouter();
  const id = useId();
  const [sqft, setSqft] = useState("");
  const [stories, setStories] = useState<number | null>(null);
  const [shape, setShape] = useState<RoofShape | null>(null);
  const [roof, setRoof] = useState<CurrentRoof>(currentRoof ?? "not_sure");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const next: Record<string, string> = {};
    const homeSqft = Number(sqft.replace(/[,\s]/g, ""));
    if (!Number.isInteger(homeSqft) || homeSqft < 400 || homeSqft > 15000)
      next.sqft = "Enter your home's living space in square feet, between 400 and 15,000.";
    if (stories === null) next.stories = "Choose how many stories your home has.";
    if (shape === null) next.shape = "Choose the shape that looks closest to your roof.";
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    setSubmitError(null);
    const r = await postEstimate({ placeId, currentRoof: roof, fallback: { homeSqft, stories: stories!, shape: shape! } });
    if (r.ok) {
      router.push(`/estimate/${encodeURIComponent(r.data.estimateId)}`);
      return;
    }
    setBusy(false);
    setSubmitError(estimateErrorMessage(r.status));
  }

  const err = (k: string) =>
    errors[k] ? (
      <p id={`${id}-${k}-error`} className="error">
        {errors[k]}
      </p>
    ) : null;

  return (
    <form onSubmit={onSubmit} noValidate aria-label="Your home's size">
      <div className="field">
        <label htmlFor={`${id}-sqft`} className="label">
          Home size
        </label>
        <p id={`${id}-sqft-hint`} className="hint">
          Living space in square feet, from a listing or tax record if you have one.
        </p>
        <input
          id={`${id}-sqft`}
          className="input num"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={sqft}
          onChange={(e) => setSqft(e.target.value)}
          aria-invalid={errors.sqft ? true : undefined}
          aria-describedby={`${id}-sqft-hint${errors.sqft ? ` ${id}-sqft-error` : ""}`}
          style={{ maxWidth: 220 }}
        />
        {err("sqft")}
      </div>

      <fieldset className="choice-group" aria-describedby={errors.stories ? `${id}-stories-error` : undefined}>
        <legend className="label">Stories</legend>
        <div className="choice-row">
          {STORIES.map((s) => (
            <label key={s.value} className="choice">
              <input
                type="radio"
                name={`${id}-stories`}
                value={s.value}
                checked={stories === s.value}
                onChange={() => setStories(s.value)}
              />
              <span>{s.label}</span>
            </label>
          ))}
        </div>
        {err("stories")}
      </fieldset>

      <fieldset className="choice-group" aria-describedby={errors.shape ? `${id}-shape-error` : undefined}>
        <legend className="label">Roof shape</legend>
        {SHAPES.map((s) => (
          <label key={s.value} className="choice">
            <input
              type="radio"
              name={`${id}-shape`}
              value={s.value}
              checked={shape === s.value}
              onChange={() => setShape(s.value)}
            />
            <span>
              <span style={{ fontWeight: 600 }}>{s.label}</span>
              <span className="muted"> {s.hint}</span>
            </span>
          </label>
        ))}
        {err("shape")}
      </fieldset>

      <div className="field">
        <label htmlFor={`${id}-roof`} className="label">
          What&apos;s on the roof now
        </label>
        <select
          id={`${id}-roof`}
          className="select"
          value={roof}
          onChange={(e) => setRoof(e.target.value as CurrentRoof)}
          style={{ maxWidth: 320, width: "100%" }}
        >
          {CURRENT_ROOFS.map((r) => (
            <option key={r} value={r}>
              {CURRENT_ROOF_LABELS[r]}
            </option>
          ))}
        </select>
      </div>

      {submitError && (
        <p className="error" role="alert">
          {submitError}
        </p>
      )}
      {Object.keys(errors).length > 0 && (
        <p className="error" role="alert">
          Check the answers above.
        </p>
      )}
      <div>
        <button type="submit" className="btn btn-primary" aria-disabled={busy || undefined}>
          {busy ? "Estimating…" : "See my estimate"}
        </button>
      </div>
    </form>
  );
}
