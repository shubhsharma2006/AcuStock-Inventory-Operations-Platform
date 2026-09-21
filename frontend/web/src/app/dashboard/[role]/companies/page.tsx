"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

type AddressObject = {
  street?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
};

type Company = {
  _id: string;
  name: string;
  shortName?: string;
  address?: string | AddressObject;
  phone?: string;
  email?: string;
  industry?: string;
  website?: string;
  taxId?: string;
  type?: string;
  isActive?: boolean;
  createdAt?: string;
};

function formatAddress(addr?: string | AddressObject): string {
  if (!addr) return "—";
  if (typeof addr === "string") return addr || "—";
  const parts = [addr.street, addr.city, addr.state, addr.zipCode, addr.country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "—";
}

export default function CompaniesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [stateVal, setStateVal] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [country, setCountry] = useState("India");
  const [industry, setIndustry] = useState("Technology");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [type, setType] = useState("SUPPLIER");
  const [formError, setFormError] = useState<string | null>(null);

  // Query companies
  const { data: rawCompanies, isLoading, error } = useQuery({
    queryKey: ["companies"],
    queryFn: () => apiFetch<any>("/companies"),
  });

  const companies: Company[] = Array.isArray(rawCompanies)
    ? rawCompanies
    : Array.isArray(rawCompanies?.companies)
    ? rawCompanies.companies
    : [];

  // Mutations
  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiFetch("/companies", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      closeModal();
    },
    onError: (err: Error) => setFormError(err.message || "Failed to create company"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      apiFetch(`/companies/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      closeModal();
    },
    onError: (err: Error) => setFormError(err.message || "Failed to update company"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/companies/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
    },
  });

  function openCreateModal() {
    setEditingCompany(null);
    setName("");
    setShortName("");
    setStreet("");
    setCity("");
    setStateVal("");
    setZipCode("");
    setCountry("India");
    setIndustry("Technology");
    setPhone("");
    setEmail("");
    setType("SUPPLIER");
    setFormError(null);
    setModalOpen(true);
  }

  function openEditModal(c: Company) {
    setEditingCompany(c);
    setName(c.name || "");
    setShortName(c.shortName || "");
    if (typeof c.address === "object" && c.address !== null) {
      setStreet(c.address.street || "");
      setCity(c.address.city || "");
      setStateVal(c.address.state || "");
      setZipCode(c.address.zipCode || "");
      setCountry(c.address.country || "India");
    } else if (typeof c.address === "string") {
      setStreet(c.address);
      setCity("");
      setStateVal("");
      setZipCode("");
      setCountry("India");
    } else {
      setStreet("");
      setCity("");
      setStateVal("");
      setZipCode("");
      setCountry("India");
    }
    setIndustry(c.industry || "Technology");
    setPhone(c.phone || "");
    setEmail(c.email || "");
    setType(c.type || "SUPPLIER");
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingCompany(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setFormError("Company name is required");
      return;
    }
    if (!email.trim()) {
      setFormError("Company email is required");
      return;
    }
    if (!phone.trim()) {
      setFormError("Company phone number is required");
      return;
    }

    const payload = {
      name: name.trim(),
      shortName: shortName.trim() || undefined,
      address: {
        street: street.trim() || "Headquarters",
        city: city.trim() || "Corporate City",
        state: stateVal.trim() || "State",
        zipCode: zipCode.trim() || "00000",
        country: country.trim() || "India",
      },
      industry: industry || "Technology",
      phone: phone.trim(),
      email: email.trim(),
      type,
    };

    if (editingCompany) {
      updateMutation.mutate({ id: editingCompany._id, payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const filtered = companies.filter(
    (c) =>
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.shortName || "").toLowerCase().includes(search.toLowerCase()) ||
      (c.email || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Companies Management</h1>
          <p className="text-sm text-slate-400">
            Manage suppliers, buyers, and partner organizations.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-300 to-orange-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:from-amber-200 hover:to-orange-400"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Company
        </button>
      </div>

      {/* Search */}
      <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4 backdrop-blur-xl">
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by company name, code, or email..."
            className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2.5 pl-10 text-sm text-white outline-none placeholder:text-slate-500 focus:border-amber-300/40"
          />
          <svg className="absolute left-3 top-3 h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* State */}
      {isLoading && <div className="p-8 text-center text-slate-400">Loading companies...</div>}
      {error && (
        <div className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">
          {(error as Error).message}
        </div>
      )}

      {/* Table */}
      {!isLoading && !error && (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/40 backdrop-blur-xl">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="border-b border-white/10 bg-slate-950/60 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-6 py-4">Company</th>
                <th className="px-6 py-4">Type</th>
                <th className="px-6 py-4">Contact Info</th>
                <th className="px-6 py-4">Address</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((c) => (
                <tr key={c._id} className="transition hover:bg-white/5">
                  <td className="px-6 py-4">
                    <div className="font-semibold text-white">{c.name}</div>
                    {c.shortName && <div className="text-xs text-slate-400">Code: {c.shortName}</div>}
                    {c.industry && <div className="text-[11px] text-amber-300/70">{c.industry}</div>}
                  </td>
                  <td className="px-6 py-4">
                    <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-slate-200">
                      {c.type || "SUPPLIER"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-400">
                    <div>{c.email || "No email"}</div>
                    <div>{c.phone || "No phone"}</div>
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-400 max-w-xs truncate">
                    {formatAddress(c.address)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(c)}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/10 hover:text-white"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Delete company ${c.name}?`)) {
                            deleteMutation.mutate(c._id);
                          }
                        }}
                        className="rounded-lg border border-rose-400/20 bg-rose-400/10 px-3 py-1.5 text-xs text-rose-300 transition hover:bg-rose-400/20"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500">
                    No companies found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl my-8">
            <h2 className="text-xl font-bold text-white">
              {editingCompany ? "Edit Company" : "Add New Company"}
            </h2>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">Company Name *</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Acme Corp"
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none focus:border-amber-300/40"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">Short Code / Tag</label>
                  <input
                    type="text"
                    value={shortName}
                    onChange={(e) => setShortName(e.target.value)}
                    placeholder="ACME"
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none focus:border-amber-300/40"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">Type</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none"
                  >
                    <option value="SUPPLIER">Supplier</option>
                    <option value="BUYER">Buyer</option>
                    <option value="MANUFACTURER">Manufacturer</option>
                    <option value="PARTNER">Partner</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">Industry</label>
                  <select
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none"
                  >
                    <option value="Technology">Technology</option>
                    <option value="Manufacturing">Manufacturing</option>
                    <option value="Retail">Retail</option>
                    <option value="Healthcare">Healthcare</option>
                    <option value="Construction">Construction</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">Email *</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="contact@acme.com"
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none focus:border-amber-300/40"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">Phone *</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1 555-0199"
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none focus:border-amber-300/40"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">Street Address</label>
                <input
                  type="text"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  placeholder="123 Industrial Parkway"
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none focus:border-amber-300/40"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="col-span-1">
                  <label className="mb-1 block text-xs font-medium text-slate-300">City</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Mumbai"
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-300/40"
                  />
                </div>
                <div className="col-span-1">
                  <label className="mb-1 block text-xs font-medium text-slate-300">State</label>
                  <input
                    type="text"
                    value={stateVal}
                    onChange={(e) => setStateVal(e.target.value)}
                    placeholder="MH"
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-300/40"
                  />
                </div>
                <div className="col-span-1">
                  <label className="mb-1 block text-xs font-medium text-slate-300">Zip / PIN</label>
                  <input
                    type="text"
                    value={zipCode}
                    onChange={(e) => setZipCode(e.target.value)}
                    placeholder="400001"
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-300/40"
                  />
                </div>
                <div className="col-span-1">
                  <label className="mb-1 block text-xs font-medium text-slate-300">Country</label>
                  <input
                    type="text"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    placeholder="India"
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-300/40"
                  />
                </div>
              </div>

              {formError && (
                <div className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-xs text-rose-200">
                  {formError}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="rounded-xl bg-gradient-to-r from-amber-300 to-orange-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:from-amber-200 hover:to-orange-400 disabled:opacity-50"
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? "Saving..."
                    : editingCompany
                    ? "Save Changes"
                    : "Create Company"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
