"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { MobileBarcodeScanner } from "@/components/barcode/mobile-barcode-scanner";
import { useHardwareBarcodeGun } from "@/hooks/use-hardware-barcode-gun";

export default function MobileWarehouseScanPage() {
  const params = useParams();
  const role = (params?.role as string) || "admin";

  const [activeMode, setActiveMode] = useState<"RECEIVE" | "PICK" | "CYCLE_COUNT" | "TRANSFER" | "LOOKUP">("RECEIVE");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [isLiveCameraActive, setIsLiveCameraActive] = useState(false);
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null);
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [justScannedCode, setJustScannedCode] = useState<string | null>(null);
  const [scanHistory, setScanHistory] = useState<Array<{ id: string; code: string; mode: string; timestamp: string; status: string }>>([]);
  const [feedback, setFeedback] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  // Video element ref & Debounce timer
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scanIntervalRef = useRef<any>(null);
  const lastScanRef = useRef<{ code: string; time: number }>({ code: "", time: 0 });

  // Audio confirmation beep via Web Audio API
  const playBeep = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
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

  const processBarcode = useCallback((code: string) => {
    const clean = code.trim();
    if (!clean) return;

    const now = Date.now();
    // 1. DEDUPLICATION GUARD: Prevent duplicate scans of the exact same barcode within 3 seconds
    if (clean === lastScanRef.current.code && now - lastScanRef.current.time < 3000) {
      return;
    }
    // 2. RAPID BURST GUARD: Prevent rapid multi-scans within 1.2 seconds
    if (now - lastScanRef.current.time < 1200) {
      return;
    }

    lastScanRef.current = { code: clean, time: now };
    setJustScannedCode(clean);
    setTimeout(() => setJustScannedCode(null), 1200);

    playBeep();

    const newScan = {
      id: Date.now().toString(),
      code: clean,
      mode: activeMode,
      timestamp: new Date().toLocaleTimeString(),
      status: "VERIFIED"
    };

    setScanHistory((prev) => [newScan, ...prev.slice(0, 19)]);
    setBarcodeInput("");
    setFeedback({
      type: "success",
      text: `✓ Captured [${clean}] in ${activeMode} workflow`
    });
  }, [activeMode, playBeep]);

  // Enterprise Hardware 2D Laser Scanner Wedge Handler
  useHardwareBarcodeGun({
    onScan: processBarcode,
    enabled: true,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    processBarcode(barcodeInput);
  };

  // Enumerate video devices
  const refreshDevices = useCallback(async () => {
    try {
      if (navigator.mediaDevices?.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevs = devices.filter((d) => d.kind === "videoinput");
        setAvailableDevices(videoDevs);
        if (videoDevs.length > 0 && !selectedDeviceId) {
          setSelectedDeviceId(videoDevs[0].deviceId);
        }
      }
    } catch (e) {
      console.warn("Device enumeration failed:", e);
    }
  }, [selectedDeviceId]);

  // Start Embedded Camera
  const startEmbeddedCamera = async (overrideDeviceId?: string) => {
    try {
      setFeedback({ type: "info", text: "Initializing camera stream..." });

      // Stop previous stream if active
      if (liveStream) {
        liveStream.getTracks().forEach((t) => t.stop());
      }

      const deviceIdToUse = overrideDeviceId || selectedDeviceId;
      let stream: MediaStream;

      try {
        const constraints: MediaStreamConstraints = {
          video: deviceIdToUse
            ? { deviceId: { exact: deviceIdToUse } }
            : {
                facingMode: { ideal: "environment" },
                width: { ideal: 1280 },
                height: { ideal: 720 }
              },
          audio: false
        };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (primaryErr) {
        console.warn("Primary constraint failed, falling back to standard video device:", primaryErr);
        // Fallback for laptops / desktop webcams
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }

      setLiveStream(stream);
      setIsLiveCameraActive(true);

      // Explicitly hook up video element
      if (videoRef.current) {
        videoRef.current.muted = true;
        videoRef.current.defaultMuted = true;
        videoRef.current.setAttribute("playsinline", "true");
        videoRef.current.setAttribute("webkit-playsinline", "true");
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (playErr) {
          console.warn("Autoplay promise failed, retrying on user click:", playErr);
        }
      }

      await refreshDevices();
      setFeedback({ type: "success", text: "Camera live. Point at barcode (3s debounce active)." });
    } catch (err: any) {
      console.error("Camera access error:", err);
      setIsLiveCameraActive(false);
      setFeedback({
        type: "error",
        text: err.name === "NotAllowedError" || err.name === "PermissionDeniedError"
          ? "Camera permission denied. Please allow camera access in your browser address bar."
          : `Failed to initialize camera: ${err.message || "Unknown error"}`
      });
    }
  };

  const stopEmbeddedCamera = () => {
    if (liveStream) {
      liveStream.getTracks().forEach((t) => t.stop());
      setLiveStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    setIsLiveCameraActive(false);
    setFeedback(null);
  };

  // Synchronize stream with video element
  useEffect(() => {
    if (videoRef.current && liveStream) {
      videoRef.current.muted = true;
      videoRef.current.defaultMuted = true;
      videoRef.current.setAttribute("playsinline", "true");
      videoRef.current.setAttribute("webkit-playsinline", "true");
      if (videoRef.current.srcObject !== liveStream) {
        videoRef.current.srcObject = liveStream;
      }
      videoRef.current.play().catch((err) => console.warn("Video auto-play warning:", err));
    }
  }, [liveStream, isLiveCameraActive]);

  // Barcode Detection Loop (Native BarcodeDetector) with Debounce Guard
  useEffect(() => {
    if (!isLiveCameraActive || !liveStream) {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
      return;
    }

    if (typeof window !== "undefined" && "BarcodeDetector" in window) {
      try {
        const detector = new (window as any).BarcodeDetector({
          formats: ["code_128", "code_39", "ean_13", "ean_8", "qr_code", "upc_a", "upc_e", "data_matrix"]
        });

        scanIntervalRef.current = setInterval(async () => {
          if (videoRef.current && videoRef.current.readyState >= 2) {
            try {
              const barcodes = await detector.detect(videoRef.current);
              if (barcodes && barcodes.length > 0) {
                const raw = barcodes[0].rawValue;
                if (raw) {
                  // processBarcode handles 3-second deduplication and 1.2-second debounce
                  processBarcode(raw);
                }
              }
            } catch (detErr) {
              // Ignore transient frame reading issues
            }
          }
        }, 350);
      } catch (initErr) {
        console.warn("BarcodeDetector initialization failed:", initErr);
      }
    }

    return () => {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
    };
  }, [isLiveCameraActive, liveStream, processBarcode]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (liveStream) {
        liveStream.getTracks().forEach((t) => t.stop());
      }
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
      }
    };
  }, [liveStream]);

  const modes = [
    { id: "RECEIVE", label: "Receive (PO)", icon: "📦" },
    { id: "PICK", label: "Pick & Pack", icon: "⚡" },
    { id: "CYCLE_COUNT", label: "Cycle Count", icon: "📋" },
    { id: "TRANSFER", label: "Transfer", icon: "🔄" },
    { id: "LOOKUP", label: "Item Lookup", icon: "🔍" }
  ];

  const quickSamples = [
    { code: "8901361333337", label: "Physical Product (Sample)" },
    { code: "MCU-STM32-407VGT6", label: "Microcontroller IC" },
    { code: "BAT-LFP-32100", label: "LiFePO4 Cell" },
    { code: "SN-2026-X89124", label: "Unit Serial #" }
  ];

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-6 pb-24 text-slate-100">
      {/* Header */}
      <div className="max-w-xl mx-auto mb-6 flex items-center justify-between">
        <Link
          href={`/dashboard/${role}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition"
        >
          ← Dashboard
        </Link>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-amber-400/10 text-amber-300 border border-amber-400/20">
            WMS Barcode Terminal
          </span>
        </div>
      </div>

      <div className="max-w-xl mx-auto space-y-5">
        {/* Mode Selector Tabs */}
        <div className="grid grid-cols-5 gap-1.5 p-1 rounded-2xl bg-slate-900 border border-white/5">
          {modes.map((mode) => {
            const isActive = activeMode === mode.id;
            return (
              <button
                key={mode.id}
                onClick={() => setActiveMode(mode.id as any)}
                className={`flex flex-col items-center justify-center p-2 rounded-xl text-[10px] font-bold transition ${
                  isActive
                    ? "bg-amber-400 text-slate-950 shadow-md font-extrabold"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <span className="text-sm mb-0.5">{mode.icon}</span>
                <span className="truncate w-full text-center">{mode.label.split(" ")[0]}</span>
              </button>
            );
          })}
        </div>

        {/* Primary Camera Scanner Card */}
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/90 backdrop-blur-xl shadow-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">📷</span>
              <div>
                <h2 className="text-sm font-bold text-white">Live Camera Scanner</h2>
                <p className="text-[11px] text-slate-400">Scan Code 128 / EAN-13 / QR codes</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isLiveCameraActive ? (
                <button
                  type="button"
                  onClick={stopEmbeddedCamera}
                  className="rounded-xl border border-rose-500/30 bg-rose-500/20 px-3 py-1.5 text-xs font-bold text-rose-300 hover:bg-rose-500/30 transition cursor-pointer"
                >
                  Stop Camera
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => startEmbeddedCamera()}
                  className="flex items-center gap-1.5 rounded-xl border border-emerald-400/40 bg-gradient-to-r from-emerald-500 to-emerald-600 px-3.5 py-1.5 text-xs font-bold text-slate-950 hover:from-emerald-400 hover:to-emerald-500 transition shadow-lg shadow-emerald-500/20 cursor-pointer"
                >
                  <span>📷</span>
                  <span>Open Camera</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsCameraModalOpen(true)}
                className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/10 transition cursor-pointer"
                title="Fullscreen Viewfinder"
              >
                ⛶ Fullscreen
              </button>
            </div>
          </div>

          {/* Camera Selection dropdown */}
          {availableDevices.length > 1 && isLiveCameraActive && (
            <div className="flex items-center justify-between text-xs bg-slate-950/60 p-2 rounded-xl border border-white/5">
              <span className="text-slate-400">Camera Source:</span>
              <select
                value={selectedDeviceId}
                onChange={(e) => {
                  setSelectedDeviceId(e.target.value);
                  startEmbeddedCamera(e.target.value);
                }}
                className="bg-slate-900 border border-white/10 rounded-lg px-2 py-1 text-xs text-white outline-none cursor-pointer"
              >
                {availableDevices.map((d, idx) => (
                  <option key={d.deviceId || idx} value={d.deviceId}>
                    {d.label || `Camera ${idx + 1}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Embedded Video Viewfinder */}
          {isLiveCameraActive && (
            <div className="relative w-full rounded-xl overflow-hidden bg-slate-950 border border-emerald-500/40 shadow-inner" style={{ minHeight: "280px", height: "300px" }}>
              <video
                ref={(el) => {
                  videoRef.current = el;
                  if (el) {
                    el.muted = true;
                    el.defaultMuted = true;
                    el.setAttribute("playsinline", "true");
                    el.setAttribute("webkit-playsinline", "true");
                    if (liveStream && el.srcObject !== liveStream) {
                      el.srcObject = liveStream;
                    }
                    el.play().catch(() => {});
                  }
                }}
                autoPlay
                playsInline
                muted
                onLoadedMetadata={() => {
                  if (videoRef.current) {
                    videoRef.current.play().catch(console.error);
                  }
                }}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />

              {/* Aiming Reticle & Animated Laser */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className={`relative h-32 w-56 border-2 border-dashed rounded-xl transition-all duration-300 ${
                  justScannedCode ? "border-emerald-300 bg-emerald-500/20 shadow-[0_0_20px_#10b981]" : "border-emerald-400/80 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                }`}>
                  {/* Corner accents */}
                  <div className="absolute -top-1 -left-1 h-3 w-3 border-t-2 border-l-2 border-emerald-300" />
                  <div className="absolute -top-1 -right-1 h-3 w-3 border-t-2 border-r-2 border-emerald-300" />
                  <div className="absolute -bottom-1 -left-1 h-3 w-3 border-b-2 border-l-2 border-emerald-300" />
                  <div className="absolute -bottom-1 -right-1 h-3 w-3 border-b-2 border-r-2 border-emerald-300" />

                  {/* Red Laser Sweep */}
                  <div
                    className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_12px_#ef4444] animate-bounce"
                    style={{ top: "50%" }}
                  />
                </div>
              </div>

              {/* Just Scanned Overlay Indicator */}
              {justScannedCode && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-emerald-950/40 backdrop-blur-[2px] transition-all">
                  <div className="rounded-xl border border-emerald-400/50 bg-slate-950/95 px-4 py-2 text-center shadow-2xl">
                    <div className="text-xs font-bold text-emerald-400">✓ SCANNED</div>
                    <div className="font-mono text-sm font-extrabold text-white">{justScannedCode}</div>
                    <div className="text-[10px] text-slate-400">Cooldown active (3s)</div>
                  </div>
                </div>
              )}

              <div className="absolute bottom-2 left-2 right-2 text-center text-[10px] bg-slate-950/80 backdrop-blur-md rounded-lg py-1 text-emerald-300 border border-emerald-500/20">
                Align barcode within target box • 3s auto-debounce active
              </div>
            </div>
          )}

          {/* Manual Input Form */}
          <form onSubmit={handleSubmit} className="space-y-3 pt-1">
            <div className="relative">
              <input
                type="text"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                placeholder="Or type/paste barcode (or use USB laser scanner)..."
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
              {barcodeInput && (
                <button
                  type="button"
                  onClick={() => setBarcodeInput("")}
                  className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={!barcodeInput.trim()}
                className="flex-1 rounded-xl bg-amber-400 py-2.5 text-xs font-bold text-slate-950 hover:bg-amber-300 transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                Confirm Scan ({activeMode})
              </button>

              <button
                type="button"
                onClick={() => {
                  if (typeof window !== "undefined") {
                    window.dispatchEvent(new CustomEvent("open-barcode-scanner"));
                  }
                }}
                className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3.5 py-2.5 text-xs font-bold text-amber-300 hover:bg-amber-400 hover:text-slate-950 transition cursor-pointer"
                title="Universal Scanner"
              >
                ⌥B Quick Modal
              </button>
            </div>
          </form>

          {/* Feedback message */}
          {feedback && (
            <div
              className={`rounded-xl p-3 text-xs font-semibold ${
                feedback.type === "success"
                  ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30"
                  : feedback.type === "error"
                  ? "bg-rose-500/10 text-rose-300 border border-rose-500/30"
                  : "bg-blue-500/10 text-blue-300 border border-blue-500/30"
              }`}
            >
              {feedback.text}
            </div>
          )}
        </div>

        {/* Quick Test Barcodes */}
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-300">Quick Test Barcodes (Click to Scan):</span>
            <span className="text-[10px] text-slate-500">Simulates physical scan</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {quickSamples.map((s) => (
              <button
                key={s.code}
                type="button"
                onClick={() => processBarcode(s.code)}
                className="flex flex-col text-left p-2 rounded-xl border border-white/5 bg-slate-950 hover:border-amber-400/40 hover:bg-white/5 transition cursor-pointer"
              >
                <span className="font-mono text-xs font-bold text-amber-300">{s.code}</span>
                <span className="text-[10px] text-slate-400">{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Scan Feed History */}
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              Session Scan Feed ({scanHistory.length})
            </span>
            {scanHistory.length > 0 && (
              <button
                type="button"
                onClick={() => setScanHistory([])}
                className="text-[10px] text-slate-500 hover:text-white"
              >
                Clear
              </button>
            )}
          </div>

          {scanHistory.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              No scans recorded in this session yet. Scan with camera, type barcode, or click a test chip above.
            </div>
          ) : (
            <div className="divide-y divide-white/5 max-h-60 overflow-y-auto space-y-1">
              {scanHistory.map((s) => (
                <div key={s.id} className="flex items-center justify-between py-2 text-xs">
                  <div>
                    <span className="font-mono font-bold text-white">{s.code}</span>
                    <div className="text-[10px] text-slate-500">{s.timestamp}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-white/5 px-2 py-0.5 text-[10px] font-mono text-amber-300 border border-white/5">
                      {s.mode}
                    </span>
                    <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[9px] font-bold text-emerald-300">
                      ✓ OK
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen Mobile Viewfinder Modal */}
      <MobileBarcodeScanner
        isOpen={isCameraModalOpen}
        onClose={() => setIsCameraModalOpen(false)}
        onScan={(code) => {
          processBarcode(code);
          setIsCameraModalOpen(false);
        }}
        title={`Scan for ${activeMode}`}
        subtitle="Align barcode or QR within frame"
      />
    </div>
  );
}
