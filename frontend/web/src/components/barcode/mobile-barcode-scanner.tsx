"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Portal } from "@/components/ui/portal";

interface MobileBarcodeScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
  title?: string;
  subtitle?: string;
}

export function MobileBarcodeScanner({
  isOpen,
  onClose,
  onScan,
  title = "Warehouse Camera Scanner",
  subtitle = "Align Code 128 or QR code within the viewfinder"
}: MobileBarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const scanIntervalRef = useRef<any>(null);

  // Play audio confirmation beep via Web Audio API
  const playBeep = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime); // 880Hz A5 beep
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
      if (navigator.vibrate) {
        navigator.vibrate(60);
      }
    } catch {}
  }, []);

  const handleDetected = useCallback((detectedCode: string) => {
    if (!detectedCode || !detectedCode.trim()) return;
    playBeep();
    onScan(detectedCode.trim());
    onClose();
  }, [playBeep, onScan, onClose]);

  // Start Camera
  useEffect(() => {
    if (!isOpen) {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        setStream(null);
      }
      setCameraActive(false);
      return;
    }

    let isMounted = true;
    async function startCamera() {
      try {
        setErrorMessage(null);
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error("Camera API not supported on this device/browser");
        }

        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });

        if (!isMounted) {
          mediaStream.getTracks().forEach((t) => t.stop());
          return;
        }

        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          videoRef.current.play().catch(() => {});
        }
        setCameraActive(true);

        // Check if flashlight / torch is supported
        const videoTrack = mediaStream.getVideoTracks()[0];
        const capabilities = videoTrack?.getCapabilities?.() as any;
        if (capabilities?.torch) {
          setHasTorch(true);
        }
      } catch (err) {
        if (isMounted) {
          console.warn("Camera access failed:", err);
          setErrorMessage(err instanceof Error ? err.message : "Camera access denied. Use manual entry below.");
          setCameraActive(false);
        }
      }
    }

    startCamera();

    return () => {
      isMounted = false;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
      }
    };
  }, [isOpen]);

  // Frame scanner loop using native BarcodeDetector
  useEffect(() => {
    if (!isOpen || !cameraActive || !videoRef.current) return;

    if ("BarcodeDetector" in window) {
      try {
        const barcodeDetector = new (window as any).BarcodeDetector({
          formats: ["code_128", "qr_code", "ean_13", "upc_a", "code_39"]
        });

        scanIntervalRef.current = setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) return;
          try {
            const barcodes = await barcodeDetector.detect(videoRef.current);
            if (barcodes && barcodes.length > 0) {
              const rawValue = barcodes[0].rawValue;
              if (rawValue) {
                clearInterval(scanIntervalRef.current);
                handleDetected(rawValue);
              }
            }
          } catch {}
        }, 150);
      } catch (err) {
        console.warn("BarcodeDetector initialization failed:", err);
      }
    }

    return () => {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
      }
    };
  }, [isOpen, cameraActive, handleDetected]);

  // Toggle Torch / Flashlight
  async function toggleTorch() {
    if (!stream || !hasTorch) return;
    try {
      const track = stream.getVideoTracks()[0];
      const nextState = !torchOn;
      await (track as any).applyConstraints({
        advanced: [{ torch: nextState }]
      });
      setTorchOn(nextState);
    } catch {}
  }

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (manualCode.trim()) {
      handleDetected(manualCode.trim());
    }
  }

  if (!isOpen) return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-md animate-in fade-in duration-200">
        <div className="relative w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/98 p-5 shadow-2xl overflow-hidden flex flex-col">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute right-4 top-4 z-20 rounded-full bg-slate-950/80 p-2 text-slate-300 hover:text-white backdrop-blur-sm cursor-pointer"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Header */}
          <div className="mb-3 pr-8">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              {title}
            </h3>
            <p className="text-xs text-slate-400">{subtitle}</p>
          </div>

          {/* Camera Viewfinder Box */}
          <div className="relative aspect-square w-full rounded-2xl bg-black overflow-hidden border border-slate-800 flex items-center justify-center">
            {cameraActive ? (
              <>
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="h-full w-full object-cover"
                />

                {/* Viewfinder Target Framing */}
                <div className="absolute inset-8 rounded-xl border-2 border-dashed border-amber-400/80 pointer-events-none flex flex-col justify-between p-2">
                  <div className="flex justify-between">
                    <span className="h-4 w-4 border-t-2 border-l-2 border-amber-400" />
                    <span className="h-4 w-4 border-t-2 border-r-2 border-amber-400" />
                  </div>

                  {/* Red Laser Scanning Beam Animation */}
                  <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-rose-500 to-transparent animate-pulse shadow-lg shadow-rose-500/80 my-auto" />

                  <div className="flex justify-between">
                    <span className="h-4 w-4 border-b-2 border-l-2 border-amber-400" />
                    <span className="h-4 w-4 border-b-2 border-r-2 border-amber-400" />
                  </div>
                </div>

                {/* Torch Button if device supports it */}
                {hasTorch && (
                  <button
                    type="button"
                    onClick={toggleTorch}
                    className={`absolute bottom-3 right-3 rounded-full p-2.5 backdrop-blur-md transition cursor-pointer ${
                      torchOn ? "bg-amber-400 text-slate-950 font-bold" : "bg-slate-950/80 text-white border border-white/20"
                    }`}
                    title="Toggle Flashlight"
                  >
                    🔦
                  </button>
                )}
              </>
            ) : (
              <div className="p-6 text-center text-slate-400">
                <div className="mb-2 text-2xl">📷</div>
                <p className="text-xs">{errorMessage || "Initializing camera hardware..."}</p>
              </div>
            )}
          </div>

          {/* Manual Entry Fallback Form */}
          <form onSubmit={handleManualSubmit} className="mt-4 pt-3 border-t border-slate-800/80">
            <label className="text-[11px] font-semibold text-slate-400 block mb-1">
              Manual Barcode / Serial / SKU Input
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="e.g. SN-98412 or SKU-104"
                className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-amber-400 font-mono"
              />
              <button
                type="submit"
                disabled={!manualCode.trim()}
                className="rounded-xl bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 disabled:opacity-40 transition cursor-pointer"
              >
                Enter
              </button>
            </div>
          </form>
        </div>
      </div>
    </Portal>
  );
}
