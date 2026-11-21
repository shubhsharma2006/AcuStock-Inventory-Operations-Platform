'use client';

import React, { useRef, useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';

interface ProofOfDeliveryModalProps {
  shipmentId: string;
  shipmentRef: string;
  customerName?: string;
  customerPhone?: string;
  expectedOtp?: string;
  onClose: () => void;
  onCompleted: (result: any) => void;
}

export function ProofOfDeliveryModal({
  shipmentId,
  shipmentRef,
  customerName = 'Customer',
  customerPhone = '',
  expectedOtp = '',
  onClose,
  onCompleted,
}: ProofOfDeliveryModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [recipientName, setRecipientName] = useState(customerName);
  const [recipientPhone, setRecipientPhone] = useState(customerPhone);
  const [deliveryOtp, setDeliveryOtp] = useState('');
  const [photoSnapped, setPhotoSnapped] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setHasSignature(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const handleCompleteDelivery = async () => {
    try {
      setLoading(true);
      setError(null);

      // Validate OTP if required
      if (expectedOtp && deliveryOtp.trim() !== expectedOtp.trim()) {
        throw new Error(`Invalid Delivery OTP. Customer must provide OTP: ${expectedOtp}`);
      }

      if (!hasSignature) {
        throw new Error('Customer or recipient digital signature is mandatory.');
      }

      const canvas = canvasRef.current;
      const signatureDataUrl = canvas ? canvas.toDataURL('image/png') : '';

      const payload = {
        deliveryOtp: deliveryOtp.trim() || undefined,
        signature: signatureDataUrl,
        photoUrl: photoSnapped ? 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=400&q=80' : undefined,
        recipientName,
        recipientPhone,
      };

      const res = await apiFetch<any>(`/tracking/${shipmentId}/complete-delivery`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      onCompleted(res);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to complete delivery');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20 text-lg border border-emerald-500/30">
              ✍️
            </span>
            <div>
              <h2 className="text-sm font-bold text-white">Proof of Delivery (e-POD)</h2>
              <p className="text-[11px] text-slate-400">
                Order <span className="font-mono text-amber-400">{shipmentRef}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-300">
            {error}
          </div>
        )}

        <div className="mt-4 space-y-3.5">
          {/* Recipient Details */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase">Received By Name</label>
              <input
                type="text"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-1.5 text-xs text-white focus:border-amber-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase">Contact Phone</label>
              <input
                type="text"
                value={recipientPhone}
                onChange={(e) => setRecipientPhone(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-1.5 text-xs text-white focus:border-amber-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Delivery OTP Input */}
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-amber-300">Customer Delivery OTP</label>
              {expectedOtp && (
                <span className="text-[10px] text-slate-400">Expected: <b className="font-mono text-white">{expectedOtp}</b></span>
              )}
            </div>
            <input
              type="text"
              maxLength={6}
              value={deliveryOtp}
              onChange={(e) => setDeliveryOtp(e.target.value)}
              placeholder="Enter 6-digit OTP from customer"
              className="w-full rounded-lg border border-amber-500/40 bg-slate-950 px-3 py-2 text-center text-base font-mono font-black tracking-widest text-amber-400 focus:border-amber-400 focus:outline-none"
            />
          </div>

          {/* Digital Signature Canvas Pad */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase">Customer Digital Signature</label>
              <button
                type="button"
                onClick={clearSignature}
                className="text-[10px] font-bold text-rose-400 hover:text-rose-300 transition"
              >
                Clear
              </button>
            </div>
            <div className="relative rounded-xl border border-white/20 bg-slate-950 overflow-hidden">
              <canvas
                ref={canvasRef}
                width={380}
                height={120}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                className="cursor-crosshair w-full touch-none"
              />
              {!hasSignature && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-slate-600">
                  Sign with finger or stylus here
                </div>
              )}
            </div>
          </div>

          {/* Photo Verification Toggle */}
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950 p-2.5">
            <div className="flex items-center gap-2">
              <span className="text-lg">📷</span>
              <div>
                <div className="text-xs font-bold text-white">Proof Photo Attached</div>
                <div className="text-[10px] text-slate-400">Doorstep / Cargo seal confirmation</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPhotoSnapped(!photoSnapped)}
              className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                photoSnapped
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-slate-800 text-slate-400 border border-white/10'
              }`}
            >
              {photoSnapped ? '✓ Attached' : '+ Attach Photo'}
            </button>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-white/10 bg-slate-800 py-2.5 text-xs font-bold text-slate-300 hover:bg-slate-700 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCompleteDelivery}
              disabled={loading}
              className="flex-1 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 py-2.5 text-xs font-bold text-slate-950 hover:brightness-110 transition shadow-xl disabled:opacity-50"
            >
              {loading ? 'Verifying & Saving…' : 'Verify & Mark Delivered'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
