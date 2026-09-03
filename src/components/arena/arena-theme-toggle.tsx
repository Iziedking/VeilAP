"use client";

import { useSyncExternalStore } from "react";

const THEME_STORAGE_KEY = "veil-arena-theme";
const THEME_EVENT = "veil-arena-theme-change";

function subscribe(onChange: () => void): () => void {
  window.addEventListener(THEME_EVENT, onChange);
  return () => window.removeEventListener(THEME_EVENT, onChange);
}

function getSnapshot(): boolean {
  return document.documentElement.dataset.theme === "dark";
}

function getServerSnapshot(): boolean {
  return false;
}

export function ArenaThemeToggle() {
  const isDark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggleTheme() {
    const nextTheme = isDark ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // The theme still applies for this page when storage is unavailable.
    }
    window.dispatchEvent(new Event(THEME_EVENT));
  }

  return (
    <button
      className="hub-theme-toggle"
      type="button"
      aria-label={`Switch to ${isDark ? "light" : "dark"} theme`}
      aria-pressed={isDark}
      onClick={toggleTheme}
    >
      <span className="hub-theme-toggle-icon" aria-hidden="true" />
      <span>{isDark ? "Light" : "Dark"}</span>
    </button>
  );
}
