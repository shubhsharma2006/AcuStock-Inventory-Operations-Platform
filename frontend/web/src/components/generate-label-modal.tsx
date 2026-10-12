"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiFetch, downloadAuthenticatedPdf } from "@/lib/api";

export interface PackageForLabel {
  _id: string;
  packageNumber: string;
  salesOrderId: string;
  status: string;
  carrier?: string;
  trackingNumber?: string;
  weight?: number;
  shippingLabelId?: string;
}

interface GenerateLabelModalProps {
  pkg: PackageForLabel;
  onClose: () => void;
  onGenerated?: () => void;
}

const labelStyle: React.CSSProperties = { fontSize: 12, color: "#9bb0cb", display: "block", marginBottom: 5 };
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 12px", borderRadius: 8, fontSize: 13,
  background: "rgba(11,20,36,0.7)", border: "1px solid rgba(148,163,184,0.18)", color: "#ecf3ff", outline: "none",
};

export default function GenerateLabelModal({ pkg, onClose, onGenerated }: GenerateLabelModalProps) {
  const [carrier, setCarrier] = useState(pkg.carrier || "Delhivery");
  const [trackingNumber, setTrackingNumber] = useState(pkg.trackingNumber || "");
  const [labelFormat, setLabelFormat] = useState<"THERMAL_4X6" | "A4_PACKING_SLIP" | "BOTH">("BOTH");
  const [weight, setWeight] = useState<number | "">(pkg.weight || "");
  const [generatedLabel, setGeneratedLabel] = useState<{ _id: string; labelNumber: string; labelFormat: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: object) => apiFetch<{ success: boolean; label: { _id: string; labelNumber: string; labelFormat: string } }>(
      "/api/labels/generate",
      {
        method: "POST",
        body: JSON.stringify(payload)
      }
    ),
    onSuccess: (data) => {
      setGeneratedLabel(data.label);
      if (onGenerated) onGenerated();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to generate shipping label");
    }
  });

  function handleSubmit() {
    setError(null);
    mutation.mutate({
      packageId: pkg._id,
      carrier,
      trackingNumber: trackingNumber.trim() || undefined,
      labelFormat,
      weight: weight ? Number(weight) : undefined
    });
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 120,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16
    }}>
      <div style={{
        background: "#0b1424", border: "1px solid rgba(148,163,184,0.2)",
        borderRadius: 16, padding: "2rem", width: "100%", maxWidth: 540
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#ecf3ff", margin: 0 }}>
              Generate Shipping Documents
            </h2>
            <p style={{ color: "#9bb0cb", fontSize: 12, marginTop: 4 }}>
              Package: <span style={{ color: "#5498ff", fontWeight: 600 }}>{pkg.packageNumber}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "#9bb0cb", fontSize: 18, cursor: "pointer" }}
          >
            ✕
          </button>
        </div>

        {generatedLabel ? (
          <div>
            <div style={{
              background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.3)",
              borderRadius: 10, padding: 16, marginBottom: 20, textAlign: "center"
            }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: "#34d399", margin: 0 }}>
                ✓ Shipping Documents Ready!
              </p>
              <p style={{ fontSize: 12, color: "#9bb0cb", marginTop: 4 }}>
                Reference: <b style={{ color: "#ecf3ff" }}>{generatedLabel.labelNumber}</b>
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
              <button
                onClick={() => downloadAuthenticatedPdf(`/labels/${generatedLabel._id}/download?type=label`, `Label-${pkg.packageNumber}.pdf`)}
                style={{
                  padding: "10px 18px", borderRadius: 8, background: "rgba(84,152,255,0.85)",
                  border: "none", color: "#ffffff", fontWeight: 700, fontSize: 13, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8
                }}
              >
                🏷 Download 4×6 Thermal Label (PDF)
              </button>

              {(generatedLabel.labelFormat === "BOTH" || generatedLabel.labelFormat === "A4_PACKING_SLIP") && (
                <button
                  onClick={() => downloadAuthenticatedPdf(`/labels/${generatedLabel._id}/download?type=packing_slip`, `PackingSlip-${pkg.packageNumber}.pdf`)}
                  style={{
                    padding: "10px 18px", borderRadius: 8, background: "rgba(167,139,250,0.85)",
                    border: "none", color: "#ffffff", fontWeight: 700, fontSize: 13, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8
                  }}
                >
                  📋 Download A4 Packing Slip (PDF)
                </button>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={onClose}
                style={{
                  padding: "8px 18px", borderRadius: 8, background: "rgba(148,163,184,0.15)",
                  border: "1px solid rgba(148,163,184,0.25)", color: "#ecf3ff", cursor: "pointer"
                }}
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 20 }}>
              <label>
                <span style={labelStyle}>Carrier / Logistics Partner *</span>
                <select
                  value={carrier}
                  onChange={(e) => setCarrier(e.target.value)}
                  style={inputStyle}
                >
                  <option value="Delhivery">Delhivery</option>
                  <option value="BlueDart">BlueDart</option>
                  <option value="FedEx">FedEx</option>
                  <option value="DHL">DHL</option>
                  <option value="Standard">Standard Courier</option>
                </select>
              </label>

              <label>
                <span style={labelStyle}>Tracking Number</span>
                <input
                  style={inputStyle}
                  placeholder="e.g. TRK-92817492"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                />
              </label>

              <label>
                <span style={labelStyle}>Document Format *</span>
                <select
                  value={labelFormat}
                  onChange={(e) => setLabelFormat(e.target.value as "THERMAL_4X6" | "A4_PACKING_SLIP" | "BOTH")}
                  style={inputStyle}
                >
                  <option value="BOTH">Both (4×6 Thermal Label + A4 Packing Slip)</option>
                  <option value="THERMAL_4X6">4×6 Thermal Shipping Label (288×432 pt)</option>
                  <option value="A4_PACKING_SLIP">A4 Packing Slip with Dispatch Sign-off</option>
                </select>
              </label>

              <label>
                <span style={labelStyle}>Weight (kg)</span>
                <input
                  style={inputStyle}
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 1.50"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value ? parseFloat(e.target.value) : "")}
                />
              </label>
            </div>

            {error && (
              <div style={{
                background: "rgba(251,113,133,0.12)", border: "1px solid rgba(251,113,133,0.3)",
                borderRadius: 8, padding: "8px 14px", color: "#fb7185", fontSize: 12, marginBottom: 16
              }}>
                ⚠ {error}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={onClose}
                style={{
                  padding: "9px 18px", borderRadius: 8, background: "transparent",
                  border: "1px solid rgba(148,163,184,0.2)", color: "#9bb0cb", cursor: "pointer"
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={mutation.isPending}
                style={{
                  padding: "9px 20px", borderRadius: 8, background: "rgba(84,152,255,0.85)",
                  border: "none", color: "#ffffff", fontWeight: 700, cursor: "pointer",
                  opacity: mutation.isPending ? 0.6 : 1
                }}
              >
                {mutation.isPending ? "Generating PDFs…" : "Generate Documents"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
