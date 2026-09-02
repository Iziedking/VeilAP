"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const MUSIC_DELAY_MS = 3_500;
const MUSIC_FILE = "/sound/soundtracklegends-poker-game-night-432168.mp3";

function isArenaRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  const arenaRoute = pathname === "/arena" || pathname.startsWith("/arena/") || pathname === "/arena-console" || pathname.startsWith("/arena-console/");
  return arenaRoute && !pathname.includes("/match/");
}

export function ArenaBackgroundMusic() {
  const pathname = usePathname();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const delayElapsedRef = useRef(false);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    try { return window.localStorage.getItem("veil-arena-sound") === "on"; } catch { return false; }
  });
  const [tableMode, setTableMode] = useState(false);
  const musicAllowed = isArenaRoute(pathname) && !tableMode;

  const startMusic = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !musicAllowed || !soundEnabled) return;
    audio.volume = 0.22;
    void audio.play().catch(() => {
      // Browser autoplay policies require a user gesture in some sessions.
    });
  }, [musicAllowed, soundEnabled]);

  useEffect(() => {
    const handlePreference = (event: Event) => {
      const enabled = (event as CustomEvent<{ enabled?: boolean }>).detail?.enabled;
      if (typeof enabled === "boolean") setSoundEnabled(enabled);
    };
    window.addEventListener("veil-arena-sound-preference", handlePreference);
    return () => window.removeEventListener("veil-arena-sound-preference", handlePreference);
  }, []);

  useEffect(() => {
    const handleSpectatorAudio = (event: Event) => {
      const mode = (event as CustomEvent<{ mode?: string }>).detail?.mode;
      setTableMode(mode === "table");
    };
    window.addEventListener("veil-arena-spectator-audio", handleSpectatorAudio);
    return () => window.removeEventListener("veil-arena-spectator-audio", handleSpectatorAudio);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!musicAllowed) {
      audio.pause();
      audio.currentTime = 0;
      delayElapsedRef.current = false;
      return;
    }

    delayElapsedRef.current = false;
    const timer = window.setTimeout(() => {
      delayElapsedRef.current = true;
      startMusic();
    }, MUSIC_DELAY_MS);
    const handleGesture = () => { if (delayElapsedRef.current) startMusic(); };
    window.addEventListener("pointerdown", handleGesture, { once: true });
    window.addEventListener("keydown", handleGesture, { once: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", handleGesture);
      window.removeEventListener("keydown", handleGesture);
    };
  }, [musicAllowed, startMusic]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!soundEnabled || tableMode || !isArenaRoute(pathname)) audio.pause();
  }, [pathname, soundEnabled, tableMode]);

  return <audio ref={audioRef} src={MUSIC_FILE} loop preload={musicAllowed ? "auto" : "none"} data-veil-arena-music aria-hidden="true" />;
}
