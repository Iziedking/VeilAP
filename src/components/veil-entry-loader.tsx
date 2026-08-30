"use client";

import { useEffect, useState } from "react";

import { VeilLogo } from "@/components/veil-logo";

type LoaderStage = "sealing" | "ready" | "leaving" | "gone";

export function VeilEntryLoader() {
  const [stage, setStage] = useState<LoaderStage>("sealing");

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const readyTimer = window.setTimeout(() => setStage("ready"), reducedMotion ? 0 : 1500);
    const leaveTimer = window.setTimeout(() => setStage("leaving"), reducedMotion ? 120 : 2600);
    const goneTimer = window.setTimeout(() => {
      setStage("gone");
      document.documentElement.classList.remove("is-loading");
    }, reducedMotion ? 140 : 3000);

    return () => {
      window.clearTimeout(readyTimer);
      window.clearTimeout(leaveTimer);
      window.clearTimeout(goneTimer);
      document.documentElement.classList.remove("is-loading");
    };
  }, []);

  if (stage === "gone") return null;

  return (
    <div
      className={`veil-entry-loader is-${stage}`}
      aria-live="polite"
      aria-label="Veil Arena is loading"
    >
      <div className="veil-entry-loader-grid" aria-hidden="true" />
      <div className="veil-entry-loader-lockup">
        <VeilLogo className="veil-entry-loader-brand" />
        <div className="veil-entry-loader-status">
          <span>{stage === "sealing" ? "SEALING THE ARENA" : "ARENA READY"}</span>
          <i aria-hidden="true" />
        </div>
      </div>
      <span className="veil-entry-loader-index" aria-hidden="true">VA / 00</span>
    </div>
  );
}
