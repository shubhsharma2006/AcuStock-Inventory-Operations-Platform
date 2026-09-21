"use client";

import { useState } from "react";

interface CsvExportButtonProps {
  /** API endpoint relative path, e.g. "/api/items/export/csv" */
  endpoint: string;
  /** Filename for the downloaded file */
  filename: string;
  /** Button label */
  label?: string;
  /** Optional additional query params */
  params?: Record<string, string>;
  /** Disabled state */
  disabled?: boolean;
}

/**
 * Reusable CSV export button.
 * Fetches from the given endpoint (with credentials + CSRF),
 * then triggers a browser download via Blob URL.
 */
export function CsvExportButton({
  endpoint,
  filename,
  label = "Export CSV",
  params = {},
  disabled = false,
}: CsvExportButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function getCookie(name: string): string | null {
    const match = document.cookie.match(
      new RegExp("(?:^|; )" + name.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1") + "=([^;]*)")
    );
    return match ? decodeURIComponent(match[1]) : null;
  }

  async function handleExport() {
    setLoading(true);
    setError(null);
    try {
      const queryString = Object.entries(params)
        .filter(([, v]) => v)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");

      const url = `${endpoint}${queryString ? `?${queryString}` : ""}`;
      const csrfToken = getCookie("csrfToken");

      const response = await fetch(url, {
        method: "GET",
        credentials: "include",
        headers: {
          ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
        },
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Export failed: ${response.status}`);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
      <button
        id={`csv-export-${filename.replace(/\W/g, "-")}`}
        onClick={handleExport}
        disabled={disabled || loading}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 18px",
          borderRadius: 8,
          background: loading ? "rgba(247,196,108,0.1)" : "rgba(247,196,108,0.15)",
          border: "1px solid rgba(247,196,108,0.35)",
          color: "#f7c46c",
          fontSize: 13,
          fontWeight: 600,
          cursor: disabled || loading ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
          transition: "background 0.2s, transform 0.1s",
          minHeight: 44,
        }}
        onMouseEnter={(e) => {
          if (!disabled && !loading)
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(247,196,108,0.25)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = loading
            ? "rgba(247,196,108,0.1)"
            : "rgba(247,196,108,0.15)";
        }}
      >
        {loading ? (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            Exporting…
          </>
        ) : (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {label}
          </>
        )}
      </button>
      {error && (
        <p style={{ color: "#fb7185", fontSize: 12, margin: 0 }}>⚠ {error}</p>
      )}
    </div>
  );
}
