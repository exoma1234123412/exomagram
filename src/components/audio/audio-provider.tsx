"use client";

import {
  createContext,
  useContext,
  useCallback,
  useRef,
  useState,
  useEffect,
  type ReactNode,
} from "react";

// ═══════════════════════════════════════════════════════════
// AUDIO BRANDING — synthesized tones via Web Audio API
// No external audio files. Each sound is generated on the fly.
// ═══════════════════════════════════════════════════════════

export type SoundType =
  | "streak-warning"
  | "streak-lost"
  | "reward"
  | "rank-up"
  | "rank-down"
  | "notification"
  | "log-entry"
  | "tick";

interface AudioContextType {
  play: (sound: SoundType) => void;
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

const AudioCtx = createContext<AudioContextType>({
  play: () => {},
  enabled: false,
  setEnabled: () => {},
});

export const useAudio = () => useContext(AudioCtx);

const STORAGE_KEY = "exomagram_audio_enabled";

// ── Sound synthesis functions ────────────────────────────

function playStreakWarning(ctx: AudioContext) {
  const now = ctx.currentTime;
  // Three fast beeps at 800Hz square wave
  for (let i = 0; i < 3; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 800;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const start = now + i * 0.15;
    gain.gain.setValueAtTime(0.15, start);
    gain.gain.setValueAtTime(0, start + 0.1);
    osc.start(start);
    osc.stop(start + 0.1);
  }
  // Descending sweep 800 -> 400Hz
  const sweep = ctx.createOscillator();
  const sweepGain = ctx.createGain();
  sweep.type = "sawtooth";
  sweep.frequency.setValueAtTime(800, now + 0.45);
  sweep.frequency.linearRampToValueAtTime(400, now + 0.75);
  sweep.connect(sweepGain);
  sweepGain.connect(ctx.destination);
  sweepGain.gain.setValueAtTime(0.12, now + 0.45);
  sweepGain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
  sweep.start(now + 0.45);
  sweep.stop(now + 0.85);
}

function playStreakLost(ctx: AudioContext) {
  const now = ctx.currentTime;
  // Low descending tone 400 -> 100Hz sine wave
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(400, now);
  osc.frequency.exponentialRampToValueAtTime(100, now + 0.5);
  osc.connect(gain);
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.2, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
  osc.start(now);
  osc.stop(now + 0.8);
  // Second layer for depth
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = "sine";
  osc2.frequency.setValueAtTime(200, now);
  osc2.frequency.exponentialRampToValueAtTime(60, now + 0.6);
  osc2.connect(gain2);
  gain2.connect(ctx.destination);
  gain2.gain.setValueAtTime(0.1, now);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
  osc2.start(now);
  osc2.stop(now + 0.9);
}

function playReward(ctx: AudioContext) {
  const now = ctx.currentTime;
  // Ascending arpeggio: C5 E5 G5 C6
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const start = now + i * 0.08;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.15, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
    osc.start(start);
    osc.stop(start + 0.25);
    // Shimmer overtone
    const shimmer = ctx.createOscillator();
    const shimmerGain = ctx.createGain();
    shimmer.type = "sine";
    shimmer.frequency.value = freq * 2;
    shimmer.connect(shimmerGain);
    shimmerGain.connect(ctx.destination);
    shimmerGain.gain.setValueAtTime(0, start);
    shimmerGain.gain.linearRampToValueAtTime(0.05, start + 0.02);
    shimmerGain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
    shimmer.start(start);
    shimmer.stop(start + 0.3);
  });
}

function playRankUp(ctx: AudioContext) {
  const now = ctx.currentTime;
  // Quick ascending two-note: 400 -> 600Hz triangle
  const freqs = [400, 600];
  freqs.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const start = now + i * 0.1;
    gain.gain.setValueAtTime(0.18, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.12);
    osc.start(start);
    osc.stop(start + 0.12);
  });
}

function playRankDown(ctx: AudioContext) {
  const now = ctx.currentTime;
  // Quick descending two-note: 600 -> 400Hz triangle
  const freqs = [600, 400];
  freqs.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const start = now + i * 0.1;
    gain.gain.setValueAtTime(0.18, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.12);
    osc.start(start);
    osc.stop(start + 0.12);
  });
}

function playNotification(ctx: AudioContext) {
  const now = ctx.currentTime;
  // Soft bell: 1200Hz sine, quick attack, gentle decay
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = 1200;
  osc.connect(gain);
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.12, now + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
  osc.start(now);
  osc.stop(now + 0.25);
}

function playLogEntry(ctx: AudioContext) {
  const now = ctx.currentTime;
  // Soft click (noise burst) + confirmation tone
  const bufferSize = ctx.sampleRate * 0.015;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * 0.3;
  }
  const noise = ctx.createBufferSource();
  const noiseGain = ctx.createGain();
  noise.buffer = buffer;
  noise.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noiseGain.gain.setValueAtTime(0.1, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.015);
  noise.start(now);
  noise.stop(now + 0.015);
  // Confirmation tone
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = 800;
  osc.connect(gain);
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0, now + 0.01);
  gain.gain.linearRampToValueAtTime(0.1, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
  osc.start(now + 0.01);
  osc.stop(now + 0.06);
}

function playTick(ctx: AudioContext) {
  const now = ctx.currentTime;
  // Very short white noise burst — 10ms
  const bufferSize = ctx.sampleRate * 0.01;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * 0.15;
  }
  const noise = ctx.createBufferSource();
  const gain = ctx.createGain();
  noise.buffer = buffer;
  noise.connect(gain);
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.08, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.01);
  noise.start(now);
  noise.stop(now + 0.01);
}

const SOUND_MAP: Record<SoundType, (ctx: AudioContext) => void> = {
  "streak-warning": playStreakWarning,
  "streak-lost": playStreakLost,
  "reward": playReward,
  "rank-up": playRankUp,
  "rank-down": playRankDown,
  "notification": playNotification,
  "log-entry": playLogEntry,
  "tick": playTick,
};

// ── Provider ─────────────────────────────────────────────

export function AudioProvider({ children }: { children: ReactNode }) {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [enabled, setEnabledState] = useState(false);

  // Initialize enabled state from localStorage or default by device
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored !== null) {
        setEnabledState(stored === "true");
      } else {
        // Default: enabled on desktop, disabled on mobile
        const isDesktop = window.innerWidth >= 768;
        setEnabledState(isDesktop);
      }
    } catch {
      // localStorage unavailable
    }
  }, []);

  const setEnabled = useCallback((value: boolean) => {
    setEnabledState(value);
    try {
      localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      // localStorage unavailable
    }
  }, []);

  const getAudioContext = useCallback((): AudioContext | null => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }
      // Resume if suspended (browsers require user gesture)
      if (audioCtxRef.current.state === "suspended") {
        audioCtxRef.current.resume();
      }
      return audioCtxRef.current;
    } catch {
      return null;
    }
  }, []);

  const play = useCallback(
    (sound: SoundType) => {
      if (!enabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;
      try {
        SOUND_MAP[sound](ctx);
      } catch {
        // Silently fail — audio is non-critical
      }
    },
    [enabled, getAudioContext]
  );

  return (
    <AudioCtx.Provider value={{ play, enabled, setEnabled }}>
      {children}
    </AudioCtx.Provider>
  );
}
