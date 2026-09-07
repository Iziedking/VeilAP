"use client";

import { useSyncExternalStore } from "react";

const SOUND_STORAGE_KEY = "veil-arena-sound";
const SOUND_EVENT = "veil-arena-sound-preference";
let memoryPreference = false;

function subscribe(onChange: () => void): () => void {
  window.addEventListener(SOUND_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(SOUND_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getSnapshot(): boolean {
  try { return window.localStorage.getItem(SOUND_STORAGE_KEY) === "on"; } catch { return memoryPreference; }
}

function getServerSnapshot(): boolean {
  return false;
}

export function ArenaSoundToggle() {
  const soundEnabled = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggleSound() {
    const next = !soundEnabled;
    memoryPreference = next;
    try { window.localStorage.setItem(SOUND_STORAGE_KEY, next ? "on" : "off"); } catch { /* preference is optional */ }
    window.dispatchEvent(new CustomEvent(SOUND_EVENT, { detail: { enabled: next } }));
  }

  return (
    <button
      className="hub-sound-toggle"
      type="button"
      aria-label={soundEnabled ? "Turn sound off" : "Turn sound on"}
      aria-pressed={soundEnabled}
      title={soundEnabled ? "Turn sound off" : "Turn sound on"}
      onClick={toggleSound}
    >
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 5 6 9H3v6h3l5 4V5Z" />
        {soundEnabled ? <path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" /> : <path d="m16 9 5 6m0-6-5 6" />}
      </svg>
      <span>{soundEnabled ? "Sound on" : "Sound off"}</span>
    </button>
  );
}
