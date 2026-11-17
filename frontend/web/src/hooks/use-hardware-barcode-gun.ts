"use client";

import { useEffect, useRef, useCallback } from "react";

interface UseHardwareBarcodeGunOptions {
  onScan: (barcode: string) => void;
  minChars?: number;
  maxInterKeyDelayMs?: number;
  enableAudioBeep?: boolean;
  enabled?: boolean;
}

/**
 * Enterprise Hardware Barcode Gun Hook
 * 
 * Accurately detects and captures continuous rapid keystrokes from 2D laser
 * barcode scanners (Zebra, Honeywell, Datalogic, Sunmi, Eyoyo) ending with 'Enter'.
 * Works globally without requiring active mouse focus on specific input fields.
 */
export function useHardwareBarcodeGun({
  onScan,
  minChars = 3,
  maxInterKeyDelayMs = 45,
  enableAudioBeep = true,
  enabled = true,
}: UseHardwareBarcodeGunOptions) {
  const bufferRef = useRef<string>("");
  const lastKeyTimeRef = useRef<number>(0);

  const playBeep = useCallback((frequency = 960, duration = 0.12) => {
    if (!enableAudioBeep || typeof window === "undefined") return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    } catch {
      // AudioContext unavailable or blocked by browser policy
    }
  }, [enableAudioBeep]);

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(e: KeyboardEvent) {
      const now = Date.now();
      const timeDiff = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      const target = e.target as HTMLElement | null;
      const isInput = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

      if (e.key === "Enter") {
        const barcode = bufferRef.current.trim();
        bufferRef.current = "";

        // If at least minChars accumulated within rapid scan timeframe
        if (barcode.length >= minChars) {
          // If in an active input, prevent standard newline or form submission
          if (isInput) {
            e.preventDefault();
            e.stopPropagation();
          }
          playBeep(960, 0.12);
          onScan(barcode);
        }
        return;
      }

      // Ignore modifier keys, functional keys (F1-F12, Escape, etc.)
      if (e.key.length !== 1 || e.ctrlKey || e.altKey || e.metaKey) {
        return;
      }

      // Check if keystroke is within the rapid wedge timing threshold
      if (timeDiff <= maxInterKeyDelayMs) {
        bufferRef.current += e.key;
      } else {
        // Reset buffer and start new token if human typing pause detected
        bufferRef.current = e.key;
      }
    }

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [enabled, minChars, maxInterKeyDelayMs, onScan, playBeep]);
}

