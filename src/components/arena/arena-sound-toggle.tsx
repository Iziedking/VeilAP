"use client";

import { useSyncExternalStore } from "react";

const SOUND_STORAGE_KEY = "veil-arena-sound";
const SOUND_EVENT = "veil-arena-sound-preference";

function subscribe(onChange: () => void): () => void {
  window.addEventListener(SOUND_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(SOUND_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getSnapshot(): boolean {
  try { return window.localStorage.getItem(SOUND_STORAGE_KEY) === "on"; } catch { return false; }
}

function getServerSnapshot(): boolean {
  return false;
}

export function ArenaSoundToggle() {
  const soundEnabled = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggleSound() {
    const next = !soundEnabled;
    try { window.localStorage.setItem(SOUND_STORAGE_KEY, next ? "on" : "off"); } catch { /* preference is optional */ }
    window.dispatchEvent(new CustomEvent(SOUND_EVENT, { detail: { enabled: next } }));
  }

  return (
    <button
      className="hub-sound-toggle"
      type="button"
      aria-label={soundEnabled ? "Turn sound off" : "Turn sound on"}
      aria-pressed={soundEnabled}
      onClick={toggleSound}
    >
      <span aria-hidden="true">{soundEnabled ? "◉" : "○"}</span>
      <span>{soundEnabled ? "Sound on" : "Sound off"}</span>
    </button>
  );
}
