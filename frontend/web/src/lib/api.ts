import { ACUSTOCK_API_BASE_URL, type AuthUser, type Role } from "@/lib/acustock";

type ApiErrorShape = {
  message?: string;
  code?: string;
};

async function parseResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const data = (await response.json()) as T & ApiErrorShape;
    if (!response.ok) {
      const errPayload = data as { message?: string; error?: string };
      throw new Error(errPayload.message || errPayload.error || "Request failed");
    }
    return data as T;
  }

  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || "Request failed");
  }
  return text as T;
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()\[\]\\/+^])/g, '\\$1') + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

  const csrfToken = getCookie("csrfToken");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> ?? {}),
  };
  if (csrfToken) {
    headers["X-CSRF-Token"] = csrfToken;
  }

  const cleanPath = path.startsWith("/api/") ? path.slice(4) : path;
  const url = `${ACUSTOCK_API_BASE_URL}${cleanPath.startsWith("/") ? cleanPath : `/${cleanPath}`}`;

  try {
    const response = await fetch(url, {
      ...init,
      credentials: "include",
      signal: controller.signal,
      headers,
    });
    clearTimeout(timeoutId);
    return parseResponse<T>(response);
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Request timed out");
    }
    throw err;
  }
}

export async function login(identifier: string, password: string, role: Role) {
  return apiFetch<{
    user: AuthUser;
    forcePasswordReset?: boolean;
    code?: string;
    mfaRequired?: boolean;
    tempToken?: string;
  }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ identifier, password, role }),
  });
}

export async function getCurrentUser() {
  return apiFetch<AuthUser>("/auth/me", { method: "GET" });
}

export async function logout() {
  return apiFetch<{ message: string }>("/auth/logout", { method: "POST" });
}

export async function refreshToken() {
  return apiFetch<{ success: boolean; token: string; user: AuthUser }>("/auth/refresh", { method: "POST" });
}

export async function downloadAuthenticatedPdf(endpoint: string, defaultFilename: string = "document.pdf"): Promise<void> {
  const csrfToken = getCookie("csrfToken");
  const headers: Record<string, string> = {};
  if (csrfToken) {
    headers["X-CSRF-Token"] = csrfToken;
  }

  const response = await fetch(`${ACUSTOCK_API_BASE_URL}${endpoint}`, {
    method: "GET",
    credentials: "include",
    headers,
  });

  if (!response.ok) {
    let errorMsg = "Failed to download PDF";
    try {
      const errJson = await response.json();
      if (errJson.error || errJson.message) {
        errorMsg = errJson.error || errJson.message;
      }
    } catch {
      // Ignore JSON parse error on non-json response
    }
    throw new Error(errorMsg);
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  
  // Try extracting filename from Content-Disposition header
  const disposition = response.headers.get("Content-Disposition");
  let filename = defaultFilename;
  if (disposition && disposition.includes("filename=")) {
    const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(disposition);
    if (matches != null && matches[1]) {
      filename = matches[1].replace(/['"]/g, "");
    }
  }

  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

export const downloadAuthenticatedFile = downloadAuthenticatedPdf;

// ── Two-Factor Authentication (2FA) API Helpers ─────────────────

export interface TwoFactorGenerateResponse {
  success: boolean;
  qrCodeDataUrl: string;
  manualKey: string;
  otpauthUrl: string;
  message: string;
}

export interface TwoFactorEnableResponse {
  success: boolean;
  message: string;
  recoveryCodes: string[];
  warning: string;
}

export interface TwoFactorStatusResponse {
  success: boolean;
  enabled: boolean;
  enabledAt: string | null;
  recoveryCodesRemaining: number;
}

export interface TwoFactorAuthenticateResponse {
  success: boolean;
  token: string;
  user: AuthUser;
  message: string;
}

export async function generate2fa(): Promise<TwoFactorGenerateResponse> {
  return apiFetch("/api/auth/2fa/generate", { method: "POST" });
}

export async function enable2fa(code: string): Promise<TwoFactorEnableResponse> {
  return apiFetch("/api/auth/2fa/enable", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function disable2fa(password: string, code: string): Promise<{ success: boolean; message: string }> {
  return apiFetch("/api/auth/2fa/disable", {
    method: "POST",
    body: JSON.stringify({ password, code }),
  });
}

export async function get2faStatus(): Promise<TwoFactorStatusResponse> {
  return apiFetch("/api/auth/2fa/status");
}

export async function authenticate2fa(tempToken: string, code: string): Promise<TwoFactorAuthenticateResponse> {
  return apiFetch("/api/auth/2fa/authenticate", {
    method: "POST",
    body: JSON.stringify({ tempToken: tempToken === "oauth-cookie" ? undefined : tempToken, code }),
  });
}

export async function regenerateRecoveryCodes(password: string, code: string): Promise<{ success: boolean; recoveryCodes: string[] }> {
  return apiFetch("/api/auth/2fa/recovery-codes/regenerate", {
    method: "POST",
    body: JSON.stringify({ password, code }),
  });
}
