"use client";

import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { generate2fa, enable2fa, disable2fa, get2faStatus, regenerateRecoveryCodes } from "@/lib/api";

// ── Shared Styles ──────────────────────────────────────────────
const cardStyle: React.CSSProperties = {
  background: "rgba(11,20,36,0.82)",
  border: "1px solid rgba(148,163,184,0.18)",
  borderRadius: 14,
  padding: "1.5rem",
  backdropFilter: "blur(18px)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: 8,
  fontSize: 14,
  background: "rgba(11,20,36,0.7)",
  border: "1px solid rgba(148,163,184,0.18)",
  color: "#ecf3ff",
  outline: "none",
  textAlign: "center",
  letterSpacing: "0.3em",
  fontWeight: 700,
  fontFamily: "monospace",
};

const btnPrimary: React.CSSProperties = {
  padding: "10px 20px",
  borderRadius: 8,
  background: "rgba(84,152,255,0.85)",
  border: "none",
  color: "#fff",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
};

const btnDanger: React.CSSProperties = {
  ...btnPrimary,
  background: "rgba(251,113,133,0.85)",
};

const btnGhost: React.CSSProperties = {
  padding: "10px 20px",
  borderRadius: 8,
  background: "transparent",
  border: "1px solid rgba(148,163,184,0.2)",
  color: "#9bb0cb",
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
};

// ── Recovery Codes Modal ───────────────────────────────────────
function RecoveryCodesModal({ codes, onClose }: { codes: string[]; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(codes.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [codes]);

  const handleDownload = useCallback(() => {
    const content = `AcuStock Recovery Codes\nGenerated: ${new Date().toISOString()}\n\n${codes.join("\n")}\n\n⚠ Each code can only be used once.\n⚠ Store these in a safe location.\n`;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "acustock-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }, [codes]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ ...cardStyle, maxWidth: 480, width: "100%" }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, color: "#ecf3ff", marginBottom: 6 }}>Your Recovery Codes</h3>
        <p style={{ fontSize: 12, color: "#fb7185", marginBottom: 16, lineHeight: 1.5 }}>
          ⚠ Save these codes in a secure location. They will only be displayed <strong>ONCE</strong>. Each code can only be used one time.
        </p>

        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 6,
          background: "rgba(0,0,0,0.3)",
          borderRadius: 10,
          padding: 16,
          marginBottom: 16,
          fontFamily: "monospace",
          fontSize: 14,
          color: "#34d399",
          fontWeight: 600
        }}>
          {codes.map((code, i) => (
            <div key={i} style={{ padding: "4px 0" }}>{code}</div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={handleCopy} style={btnGhost}>
            {copied ? "✓ Copied!" : "📋 Copy All"}
          </button>
          <button onClick={handleDownload} style={btnGhost}>
            ⬇ Download
          </button>
          <button onClick={onClose} style={btnPrimary}>
            I&apos;ve Saved These
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Setup Modal (QR + Verify) ──────────────────────────────────
function SetupModal({ onClose, onEnabled }: { onClose: () => void; onEnabled: (codes: string[]) => void }) {
  const [step, setStep] = useState<"loading" | "scan" | "verify">("loading");
  const [qrData, setQrData] = useState<{ qrCodeDataUrl: string; manualKey: string } | null>(null);
  const [showManualKey, setShowManualKey] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Generate QR on mount
  useState(() => {
    generate2fa()
      .then((res) => {
        setQrData({ qrCodeDataUrl: res.qrCodeDataUrl, manualKey: res.manualKey });
        setStep("scan");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to generate 2FA secret");
        setStep("scan");
      });
  });

  async function handleVerify() {
    if (code.length !== 6) return;
    setLoading(true);
    setError(null);
    try {
      const res = await enable2fa(code);
      if (res.success) {
        onEnabled(res.recoveryCodes);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ ...cardStyle, maxWidth: 440, width: "100%" }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, color: "#ecf3ff", marginBottom: 16 }}>Enable Two-Factor Authentication</h3>

        {step === "loading" && (
          <p style={{ color: "#9bb0cb", fontSize: 13, textAlign: "center", padding: "2rem 0" }}>Generating your 2FA secret…</p>
        )}

        {step === "scan" && qrData && (
          <>
            <p style={{ color: "#9bb0cb", fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>
              <strong style={{ color: "#ecf3ff" }}>Step 1:</strong> Scan this QR code with your Authenticator app (Google Authenticator, Authy, 1Password, etc.)
            </p>

            <div style={{ textAlign: "center", marginBottom: 16, background: "#fff", borderRadius: 12, padding: 16, display: "inline-block", width: "100%" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrData.qrCodeDataUrl} alt="2FA QR Code" style={{ width: 200, height: 200, margin: "0 auto", display: "block" }} />
            </div>

            <button
              onClick={() => setShowManualKey(!showManualKey)}
              style={{ fontSize: 12, color: "#5498ff", background: "none", border: "none", cursor: "pointer", marginBottom: 12, padding: 0, display: "block" }}
            >
              {showManualKey ? "Hide manual key" : "Can't scan? Show manual setup key"}
            </button>

            {showManualKey && (
              <div style={{
                background: "rgba(0,0,0,0.3)",
                borderRadius: 8,
                padding: "10px 14px",
                fontFamily: "monospace",
                fontSize: 13,
                color: "#f7c46c",
                marginBottom: 16,
                wordBreak: "break-all",
                textAlign: "center",
                letterSpacing: "0.1em"
              }}>
                {qrData.manualKey}
              </div>
            )}

            <p style={{ color: "#9bb0cb", fontSize: 13, marginBottom: 8, lineHeight: 1.5 }}>
              <strong style={{ color: "#ecf3ff" }}>Step 2:</strong> Enter the 6-digit code from your Authenticator app
            </p>

            <input
              id="2fa-verify-code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => e.key === "Enter" && handleVerify()}
              placeholder="000000"
              style={{ ...inputStyle, marginBottom: 12 }}
              autoFocus
            />

            {error && <p style={{ color: "#fb7185", fontSize: 12, marginBottom: 10 }}>⚠ {error}</p>}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={onClose} style={btnGhost}>Cancel</button>
              <button
                id="2fa-enable-submit"
                onClick={handleVerify}
                disabled={code.length !== 6 || loading}
                style={{ ...btnPrimary, opacity: code.length !== 6 || loading ? 0.5 : 1 }}
              >
                {loading ? "Verifying…" : "Verify & Enable"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Disable Modal (Password + OTP) ─────────────────────────────
function DisableModal({ onClose, onDisabled }: { onClose: () => void; onDisabled: () => void }) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleDisable() {
    if (!password || code.length !== 6) return;
    setLoading(true);
    setError(null);
    try {
      const res = await disable2fa(password, code);
      if (res.success) onDisabled();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disable 2FA");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ ...cardStyle, maxWidth: 420, width: "100%" }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, color: "#fb7185", marginBottom: 16 }}>Disable Two-Factor Authentication</h3>
        <p style={{ fontSize: 12, color: "#9bb0cb", marginBottom: 16, lineHeight: 1.5 }}>
          To disable 2FA, enter your current password and a valid 6-digit code from your Authenticator app.
        </p>

        <label style={{ display: "block", marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: "#9bb0cb", display: "block", marginBottom: 5 }}>Current Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ ...inputStyle, textAlign: "left", letterSpacing: "normal", fontFamily: "inherit" }}
            placeholder="Enter your password"
          />
        </label>

        <label style={{ display: "block", marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: "#9bb0cb", display: "block", marginBottom: 5 }}>6-Digit Authentication Code</span>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            onKeyDown={(e) => e.key === "Enter" && handleDisable()}
            placeholder="000000"
            style={inputStyle}
          />
        </label>

        {error && <p style={{ color: "#fb7185", fontSize: 12, marginBottom: 10 }}>⚠ {error}</p>}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={btnGhost}>Cancel</button>
          <button
            onClick={handleDisable}
            disabled={!password || code.length !== 6 || loading}
            style={{ ...btnDanger, opacity: !password || code.length !== 6 || loading ? 0.5 : 1 }}
          >
            {loading ? "Disabling…" : "Disable 2FA"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN EXPORT — TwoFactorSettings
// ═══════════════════════════════════════════════════════════════

export default function TwoFactorSettings() {
  const queryClient = useQueryClient();
  const [showSetup, setShowSetup] = useState(false);
  const [showDisable, setShowDisable] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  const { data: status, isLoading } = useQuery({
    queryKey: ["2fa-status"],
    queryFn: get2faStatus,
  });

  function handleEnabled(codes: string[]) {
    setShowSetup(false);
    setRecoveryCodes(codes);
    queryClient.invalidateQueries({ queryKey: ["2fa-status"] });
  }

  function handleDisabled() {
    setShowDisable(false);
    queryClient.invalidateQueries({ queryKey: ["2fa-status"] });
  }

  if (isLoading) {
    return (
      <div style={cardStyle}>
        <div className="skeleton" style={{ height: 60, borderRadius: 8 }} />
      </div>
    );
  }

  const enabled = status?.enabled ?? false;

  return (
    <>
      {showSetup && <SetupModal onClose={() => setShowSetup(false)} onEnabled={handleEnabled} />}
      {showDisable && <DisableModal onClose={() => setShowDisable(false)} onDisabled={handleDisabled} />}
      {recoveryCodes && <RecoveryCodesModal codes={recoveryCodes} onClose={() => setRecoveryCodes(null)} />}

      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "#ecf3ff", marginBottom: 4 }}>
              🔐 Two-Factor Authentication
            </h3>
            <p style={{ fontSize: 12, color: "#9bb0cb", lineHeight: 1.5 }}>
              {enabled
                ? `Enabled${status?.enabledAt ? ` since ${new Date(status.enabledAt).toLocaleDateString()}` : ""}. ${status?.recoveryCodesRemaining ?? 0} recovery codes remaining.`
                : "Add an extra layer of security to your account using an Authenticator app."}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{
              padding: "4px 12px",
              borderRadius: 20,
              fontSize: 11,
              fontWeight: 600,
              background: enabled ? "rgba(52,211,153,0.12)" : "rgba(155,176,203,0.1)",
              border: `1px solid ${enabled ? "rgba(52,211,153,0.3)" : "rgba(155,176,203,0.2)"}`,
              color: enabled ? "#34d399" : "#9bb0cb",
            }}>
              {enabled ? "ENABLED" : "DISABLED"}
            </span>

            {enabled ? (
              <button id="disable-2fa-btn" onClick={() => setShowDisable(true)} style={btnDanger}>
                Disable
              </button>
            ) : (
              <button id="enable-2fa-btn" onClick={() => setShowSetup(true)} style={btnPrimary}>
                Enable 2FA
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
