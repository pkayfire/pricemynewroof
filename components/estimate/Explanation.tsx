"use client";

// "Why this price" text, fetched after the estimate has rendered (docs/SPEC.md Explanation service).
import { useEffect, useState } from "react";
import type { ExplanationResponse } from "@/lib/api/types";

type State = { kind: "loading" } | { kind: "done"; text: string } | { kind: "error" };

export function Explanation({ estimateId }: { estimateId: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/explanation/${encodeURIComponent(estimateId)}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as ExplanationResponse;
        setState({ kind: "done", text: body.text });
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setState({ kind: "error" });
        void err;
      });
    return () => controller.abort();
  }, [estimateId]);

  return (
    <p className={`why-text${state.kind === "loading" ? " why-loading" : ""}`} aria-live="polite" aria-busy={state.kind === "loading"}>
      {state.kind === "loading" && "Writing a short explanation of your price…"}
      {state.kind === "done" && state.text}
      {state.kind === "error" && "The explanation couldn't load. The cost breakdown below shows where the money goes."}
    </p>
  );
}
