"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

type TenantWorkspaceResponse = {
  success: boolean;
  tenant: {
    _id: string;
    name: string;
    slug: string;
    customDomain?: {
      domain?: string;
      verificationToken?: string;
      cnameTarget?: string;
      status: "NONE" | "PENDING_DNS" | "VERIFIED" | "FAILED";
      verifiedAt?: string;
      lastCheckedAt?: string;
    };
  };
};

type SsoConfigResponse = {
  success: boolean;
  slug: string;
  sso: {
    enabled: boolean;
    enforced: boolean;
    domainPatterns: string[];
    idpIssuer: string;
    idpSsoUrl: string;
    idpCertificate: string;
    allowJitProvisioning: boolean;
    defaultRole: "USER" | "MANAGER";
  };
};

export function CustomDomainSettingsPanel() {
  const queryClient = useQueryClient();
  const [domainInput, setDomainInput] = useState("");
  const [feedback, setFeedback] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const { data, isLoading } = useQuery<TenantWorkspaceResponse>({
    queryKey: ["tenant-workspace-domain"],
    queryFn: () => apiFetch<TenantWorkspaceResponse>("/tenants/current"),
  });

  const tenant = data?.tenant;
  const customDomain = tenant?.customDomain;

  const registerMutation = useMutation({
    mutationFn: (domain: string) =>
      apiFetch("/tenants/custom-domain", {
        method: "POST",
        body: JSON.stringify({ domain }),
      }),
    onSuccess: () => {
      setFeedback({ text: "Custom domain registered! Please configure DNS records.", type: "success" });
      queryClient.invalidateQueries({ queryKey: ["tenant-workspace-domain"] });
    },
    onError: (err: any) => {
      setFeedback({ text: err.message || "Failed to register custom domain.", type: "error" });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: () =>
      apiFetch("/tenants/custom-domain/verify", {
        method: "POST",
      }),
    onSuccess: (res: any) => {
      if (res.verified) {
        setFeedback({ text: "🎉 DNS Verified! Domain is now live and routing to your workspace.", type: "success" });
      } else {
        setFeedback({ text: `DNS check failed: ${res.reason || "Records not detected yet. DNS propagation may take up to 10 minutes."}`, type: "error" });
      }
      queryClient.invalidateQueries({ queryKey: ["tenant-workspace-domain"] });
    },
    onError: (err: any) => {
      setFeedback({ text: err.message || "DNS verification lookup failed.", type: "error" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      apiFetch("/tenants/custom-domain", {
        method: "DELETE",
      }),
    onSuccess: () => {
      setFeedback({ text: "Custom domain removed.", type: "success" });
      setDomainInput("");
      queryClient.invalidateQueries({ queryKey: ["tenant-workspace-domain"] });
    },
    onError: (err: any) => {
      setFeedback({ text: err.message || "Failed to remove domain.", type: "error" });
    },
  });

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case "VERIFIED":
        return <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-400 border border-emerald-500/30">🟢 VERIFIED & ACTIVE</span>;
      case "PENDING_DNS":
        return <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-300 border border-amber-500/30">🟡 PENDING DNS PROPAGATION</span>;
      case "FAILED":
        return <span className="rounded-full bg-rose-500/20 px-3 py-1 text-xs font-bold text-rose-400 border border-rose-500/30">🔴 DNS VERIFICATION FAILED</span>;
      default:
        return <span className="rounded-full bg-slate-500/20 px-3 py-1 text-xs font-semibold text-slate-400">UNCONFIGURED</span>;
    }
  };

  return (
    <div className="space-y-6 pt-4">
      <div className="border-b border-white/10 pb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider font-bold text-indigo-400">Zoho One Standard</span>
          <span className="rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-[10px] font-bold text-indigo-400 border border-indigo-500/20">
            CNAME & TXT Verification
          </span>
        </div>
        <h3 className="text-xl font-bold text-white mt-1">🌐 White-Label Custom Domain</h3>
        <p className="text-xs text-slate-400 mt-1 max-w-2xl">
          Point your company domain (e.g. <code className="text-indigo-300">inventory.acme.com</code>) directly to AcuStock. All workspace users will sign in under your branded URL.
        </p>
      </div>

      {feedback && (
        <div className={`p-4 rounded-2xl text-xs font-semibold border ${
          feedback.type === "success"
            ? "bg-emerald-950/30 text-emerald-300 border-emerald-500/30"
            : "bg-rose-950/30 text-rose-300 border-rose-500/30"
        }`}>
          {feedback.text}
        </div>
      )}

      {isLoading ? (
        <div className="text-xs text-slate-400 py-6">Loading domain telemetry...</div>
      ) : customDomain?.domain ? (
        <div className="space-y-6">
          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-4">
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-500">Registered Custom Domain</div>
                <div className="text-lg font-mono font-bold text-white mt-0.5">{customDomain.domain}</div>
              </div>
              <div>{getStatusBadge(customDomain.status)}</div>
            </div>

            {/* DNS Instructions Table */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-300">Required DNS Records in your Registrar (Cloudflare, GoDaddy, Route53):</div>
              <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/40">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-white/5 text-[10px] uppercase text-slate-400 border-b border-white/10">
                    <tr>
                      <th className="p-3">Type</th>
                      <th className="p-3">Host / Name</th>
                      <th className="p-3">Points to / Value</th>
                      <th className="p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    <tr>
                      <td className="p-3 font-bold text-indigo-400">CNAME</td>
                      <td className="p-3 text-white">{customDomain.domain.split(".")[0]}</td>
                      <td className="p-3 text-slate-300">{customDomain.cnameTarget || "cname.acustock.com"}</td>
                      <td className="p-3 text-emerald-400">Mandatory</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-bold text-amber-400">TXT</td>
                      <td className="p-3 text-white">_acustock-challenge.{customDomain.domain}</td>
                      <td className="p-3 text-slate-300 truncate max-w-xs">{customDomain.verificationToken}</td>
                      <td className="p-3 text-emerald-400">Verification</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="text-[11px] text-slate-500">
                Last checked: {customDomain.lastCheckedAt ? new Date(customDomain.lastCheckedAt).toLocaleString() : "Never"}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => verifyMutation.mutate()}
                  disabled={verifyMutation.isPending}
                  className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-xs font-bold text-white transition disabled:opacity-50"
                >
                  {verifyMutation.isPending ? "Checking DNS..." : "🔄 Verify DNS Now"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("Are you sure you want to detach this custom domain?")) {
                      deleteMutation.mutate();
                    }
                  }}
                  disabled={deleteMutation.isPending}
                  className="rounded-xl border border-rose-500/30 bg-rose-950/20 hover:bg-rose-900/30 px-4 py-2 text-xs font-semibold text-rose-300 transition"
                >
                  Detach Domain
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-6 space-y-4 max-w-xl">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300">Enter Your Subdomain or Custom Domain</label>
            <input
              type="text"
              value={domainInput}
              onChange={(e) => setDomainInput(e.target.value.toLowerCase())}
              placeholder="e.g. inventory.yourcompany.com"
              className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-2.5 text-xs sm:text-sm text-white font-mono outline-none focus:border-indigo-400"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              if (!domainInput.trim()) return;
              registerMutation.mutate(domainInput.trim());
            }}
            disabled={registerMutation.isPending || !domainInput.trim()}
            className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-5 py-2.5 text-xs font-bold text-white transition disabled:opacity-50"
          >
            {registerMutation.isPending ? "Configuring..." : "Register Custom Domain"}
          </button>
        </div>
      )}
    </div>
  );
}

export function EnterpriseSsoSettingsPanel() {
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const { data, isLoading } = useQuery<SsoConfigResponse>({
    queryKey: ["tenant-sso-config"],
    queryFn: () => apiFetch<SsoConfigResponse>("/tenants/sso"),
  });

  const [form, setForm] = useState({
    enabled: false,
    enforced: false,
    domainPatterns: "",
    idpIssuer: "",
    idpSsoUrl: "",
    idpCertificate: "",
    allowJitProvisioning: true,
    defaultRole: "USER" as "USER" | "MANAGER",
  });

  // Sync state once fetched
  const [isSynced, setIsSynced] = useState(false);
  if (data?.sso && !isSynced) {
    setForm({
      enabled: data.sso.enabled || false,
      enforced: data.sso.enforced || false,
      domainPatterns: (data.sso.domainPatterns || []).join(", "),
      idpIssuer: data.sso.idpIssuer || "",
      idpSsoUrl: data.sso.idpSsoUrl || "",
      idpCertificate: data.sso.idpCertificate || "",
      allowJitProvisioning: data.sso.allowJitProvisioning !== false,
      defaultRole: data.sso.defaultRole || "USER",
    });
    setIsSynced(true);
  }

  const saveMutation = useMutation({
    mutationFn: (payload: any) =>
      apiFetch("/tenants/sso", {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      setFeedback({ text: "Enterprise SAML SSO settings saved successfully!", type: "success" });
      queryClient.invalidateQueries({ queryKey: ["tenant-sso-config"] });
    },
    onError: (err: any) => {
      setFeedback({ text: err.message || "Failed to save SSO settings.", type: "error" });
    },
  });

  const handleSave = () => {
    const domains = form.domainPatterns
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);

    saveMutation.mutate({
      enabled: form.enabled,
      enforced: form.enforced,
      domainPatterns: domains,
      idpIssuer: form.idpIssuer,
      idpSsoUrl: form.idpSsoUrl,
      idpCertificate: form.idpCertificate,
      allowJitProvisioning: form.allowJitProvisioning,
      defaultRole: form.defaultRole,
    });
  };

  const metadataUrl = data?.slug ? `/api/auth/sso/metadata/${data.slug}` : null;

  return (
    <div className="space-y-6 pt-4">
      <div className="border-b border-white/10 pb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider font-bold text-indigo-400">SAP Cloud Identity Standard</span>
          <span className="rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-[10px] font-bold text-indigo-400 border border-indigo-500/20">
            SAML 2.0 / Okta / Azure AD
          </span>
        </div>
        <h3 className="text-xl font-bold text-white mt-1">🛡️ Enterprise SAML 2.0 Single Sign-On (SSO)</h3>
        <p className="text-xs text-slate-400 mt-1 max-w-2xl">
          Federate user authentication with Okta, Microsoft Entra ID (Azure AD), Google Workspace, or PingIdentity. Includes automated Just-In-Time (JIT) user provisioning.
        </p>
      </div>

      {feedback && (
        <div className={`p-4 rounded-2xl text-xs font-semibold border ${
          feedback.type === "success"
            ? "bg-emerald-950/30 text-emerald-300 border-emerald-500/30"
            : "bg-rose-950/30 text-rose-300 border-rose-500/30"
        }`}>
          {feedback.text}
        </div>
      )}

      {metadataUrl && (
        <div className="rounded-2xl border border-indigo-500/20 bg-indigo-950/20 p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-indigo-300">Service Provider (SP) Metadata XML</div>
            <div className="text-[11px] text-slate-400">Import this endpoint into Okta or Azure AD to auto-configure ACS and Entity ID.</div>
          </div>
          <a
            href={metadataUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-indigo-500/30 bg-indigo-600/20 hover:bg-indigo-600/30 px-3.5 py-1.5 text-xs font-bold text-indigo-300 transition"
          >
            📥 Download SP Metadata XML
          </a>
        </div>
      )}

      {isLoading ? (
        <div className="text-xs text-slate-400 py-6">Loading SSO configuration...</div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-6 space-y-5 max-w-3xl">
          {/* Toggles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-b border-white/5 pb-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-0"
              />
              <div>
                <div className="text-xs font-bold text-white">Enable SAML 2.0 SSO</div>
                <div className="text-[11px] text-slate-400">Allows domain users to log in with corporate IdP</div>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.enforced}
                onChange={(e) => setForm({ ...form, enforced: e.target.checked })}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-0"
              />
              <div>
                <div className="text-xs font-bold text-white">Enforce SSO (Block Passwords)</div>
                <div className="text-[11px] text-slate-400">Disables regular password login for corporate domains</div>
              </div>
            </label>
          </div>

          {/* Form Fields */}
          <div className="space-y-4 text-xs">
            <div>
              <label className="text-slate-300 font-semibold block mb-1">Corporate Email Domains (comma-separated)</label>
              <input
                type="text"
                value={form.domainPatterns}
                onChange={(e) => setForm({ ...form, domainPatterns: e.target.value })}
                placeholder="acme.com, acmecorp.com"
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-3.5 py-2 text-white font-mono outline-none focus:border-indigo-400"
              />
              <span className="text-[10px] text-slate-500 mt-0.5 block">Users typing an email matching these domains will be routed to IdP</span>
            </div>

            <div>
              <label className="text-slate-300 font-semibold block mb-1">IdP Single Sign-On URL (HTTP-POST / Redirect)</label>
              <input
                type="text"
                value={form.idpSsoUrl}
                onChange={(e) => setForm({ ...form, idpSsoUrl: e.target.value })}
                placeholder="https://dev-12345.okta.com/app/acustock/sso/saml"
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-3.5 py-2 text-white font-mono outline-none focus:border-indigo-400"
              />
            </div>

            <div>
              <label className="text-slate-300 font-semibold block mb-1">IdP Entity ID / Issuer</label>
              <input
                type="text"
                value={form.idpIssuer}
                onChange={(e) => setForm({ ...form, idpIssuer: e.target.value })}
                placeholder="http://www.okta.com/exk123456789"
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-3.5 py-2 text-white font-mono outline-none focus:border-indigo-400"
              />
            </div>

            <div>
              <label className="text-slate-300 font-semibold block mb-1">IdP Public X.509 Certificate (PEM format)</label>
              <textarea
                rows={4}
                value={form.idpCertificate}
                onChange={(e) => setForm({ ...form, idpCertificate: e.target.value })}
                placeholder="-----BEGIN CERTIFICATE-----&#10;MIIDpDCCAoygAwIBAgIGAX...&#10;-----END CERTIFICATE-----"
                className="w-full rounded-xl border border-white/10 bg-slate-900 p-3 text-white font-mono text-[11px] outline-none focus:border-indigo-400"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-white/5 pt-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.allowJitProvisioning}
                  onChange={(e) => setForm({ ...form, allowJitProvisioning: e.target.checked })}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-0"
                />
                <div>
                  <div className="font-bold text-white">Just-In-Time (JIT) Provisioning</div>
                  <div className="text-[10px] text-slate-500">Auto-create user account on first successful SSO sign-in</div>
                </div>
              </label>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">Default JIT Role</label>
                <select
                  value={form.defaultRole}
                  onChange={(e) => setForm({ ...form, defaultRole: e.target.value as any })}
                  className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white outline-none"
                >
                  <option value="USER">USER (Standard Operator)</option>
                  <option value="MANAGER">MANAGER (Supervisor)</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-6 py-2.5 text-xs font-bold text-white transition disabled:opacity-50"
            >
              {saveMutation.isPending ? "Saving SSO..." : "Save Enterprise SSO"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

