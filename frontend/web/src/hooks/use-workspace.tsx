"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";

export interface WorkspaceBranding {
  logoUrl: string | null;
  supportEmail: string | null;
  phone: string | null;
  address: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
  taxId: string | null;
  invoiceTerms: string | null;
}

export interface WorkspaceSettings {
  currency: string;
  timezone: string;
  dateFormat: string;
}

export interface WorkspaceData {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  branding: WorkspaceBranding;
  settings: WorkspaceSettings;
}

interface WorkspaceState {
  workspace: WorkspaceData | null;
  subdomain: string | null;
  isCustomWorkspace: boolean;
  loading: boolean;
  error: string | null;
}

const RESERVED_SUBDOMAINS = new Set([
  "www", "api", "app", "admin", "superadmin", "billing", "auth",
  "mail", "status", "cdn", "static", "assets", "test", "demo",
  "dev", "stage", "staging", "prod", "localhost"
]);

function extractSubdomain(hostname: string): string | null {
  if (!hostname) return null;
  const host = hostname.toLowerCase().trim();

  // Strip port
  const domain = host.split(":")[0];

  if (domain === "localhost" || /^(\d{1,3}\.){3}\d{1,3}$/.test(domain)) {
    return null;
  }

  if (domain.endsWith(".localhost")) {
    const sub = domain.slice(0, -".localhost".length);
    if (!sub || sub.includes(".")) return null;
    return RESERVED_SUBDOMAINS.has(sub) ? null : sub;
  }

  const parts = domain.split(".");
  if (parts.length >= 3) {
    const candidate = parts[0];
    if (candidate && !RESERVED_SUBDOMAINS.has(candidate)) {
      return candidate;
    }
  }

  return null;
}

const WorkspaceContext = createContext<WorkspaceState>({
  workspace: null,
  subdomain: null,
  isCustomWorkspace: false,
  loading: true,
  error: null,
});

export function useWorkspace() {
  return useContext(WorkspaceContext);
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [subdomain, setSubdomain] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function resolveWorkspace() {
      try {
        setLoading(true);
        const detectedSub = typeof window !== "undefined" ? extractSubdomain(window.location.hostname) : null;
        setSubdomain(detectedSub);

        if (detectedSub) {
          // Fetch workspace by subdomain slug
          const res = await apiFetch<{ success: boolean; workspace: WorkspaceData }>(
            `/tenants/workspace/${detectedSub}`
          );
          if (cancelled) return;
          if (res?.success && res.workspace) {
            setWorkspace(res.workspace);
            document.title = `${res.workspace.name} — AcuStock ERP`;
          }
        } else {
          // Check if session has a current resolved workspace
          const res = await apiFetch<{ success: boolean; resolved: boolean; workspace: WorkspaceData | null }>(
            "/tenants/current"
          );
          if (cancelled) return;
          if (res?.success && res.workspace) {
            setWorkspace(res.workspace);
            document.title = `${res.workspace.name} — AcuStock ERP`;
          }
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load workspace");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    resolveWorkspace();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <WorkspaceContext.Provider
      value={{
        workspace,
        subdomain,
        isCustomWorkspace: Boolean(workspace && workspace.slug !== "default-org"),
        loading,
        error,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}
