"use client";

import { useState, useMemo } from "react";
import { apiFetch } from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TypeaheadInput } from "@/components/ui/typeahead-input";
import { ALL_INDIAN_STATES, INDIAN_STATES_AND_CITIES, TOP_ALL_INDIAN_CITIES } from "@/lib/india-geo-data";

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
  legalName?: string;
  shortName?: string;
  address?: string | AddressObject;
  shippingAddress?: AddressObject;
  phone?: string;
  email?: string;
  contactPerson?: string;
  industry?: string;
  website?: string;
  taxId?: string;
  pan?: string;
  cin?: string;
  msme?: string;
  type?: "SUPPLIER" | "BUYER" | "MANUFACTURER" | "PARTNER" | "CUSTOMER";
  paymentTerms?: string;
  creditLimit?: number;
  currency?: string;
  notes?: string;
  isActive?: boolean;
  createdAt?: string;
};

function formatAddress(addr?: string | AddressObject): string {
  if (!addr) return "—";
  if (typeof addr === "string") return addr || "—";
  const parts = [addr.street, addr.city, addr.state, addr.zipCode, addr.country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "—";
}

const PAYMENT_TERMS_OPTIONS = [
  "Due on Receipt",
  "Net 15",
  "Net 30",
  "Net 45",
  "Net 60",
  "Net 90",
  "100% Advance",
  "50% Advance / 50% on Delivery",
  "Cash on Delivery (COD)",
];

const CURRENCY_OPTIONS = ["INR (₹)", "USD ($)", "EUR (€)", "GBP (£)", "AED (د.إ)", "SGD ($)"];

export default function CompaniesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [activeFormTab, setActiveFormTab] = useState<"general" | "tax" | "address" | "financials">("general");

  // Form states: Core Profile
  const [name, setName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [shortName, setShortName] = useState("");
  const [type, setType] = useState<"SUPPLIER" | "BUYER" | "MANUFACTURER" | "PARTNER" | "CUSTOMER">("SUPPLIER");
  const [industry, setIndustry] = useState("Technology");
  const [isActive, setIsActive] = useState(true);

  // Contact
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [website, setWebsite] = useState("");

  // Tax & Statutory
  const [taxId, setTaxId] = useState(""); // GSTIN / Tax ID
  const [pan, setPan] = useState("");
  const [cin, setCin] = useState("");
  const [msme, setMsme] = useState("");

  // Billing Address
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [stateVal, setStateVal] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [country, setCountry] = useState("India");

  // Shipping Address
  const [sameAsBilling, setSameAsBilling] = useState(true);
  const [shipStreet, setShipStreet] = useState("");
  const [shipCity, setShipCity] = useState("");
  const [shipStateVal, setShipStateVal] = useState("");
  const [shipZipCode, setShipZipCode] = useState("");
  const [shipCountry, setShipCountry] = useState("India");

  // Dynamic City options matching chosen State
  const billingCityOptions = useMemo(() => {
    if (stateVal && INDIAN_STATES_AND_CITIES[stateVal]) {
      return INDIAN_STATES_AND_CITIES[stateVal];
    }
    return TOP_ALL_INDIAN_CITIES;
  }, [stateVal]);

  const shippingCityOptions = useMemo(() => {
    if (shipStateVal && INDIAN_STATES_AND_CITIES[shipStateVal]) {
      return INDIAN_STATES_AND_CITIES[shipStateVal];
    }
    return TOP_ALL_INDIAN_CITIES;
  }, [shipStateVal]);

  // Financials & Terms
  const [paymentTerms, setPaymentTerms] = useState("Net 30");
  const [creditLimit, setCreditLimit] = useState<number>(0);
  const [currency, setCurrency] = useState("INR");
  const [notes, setNotes] = useState("");

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
      queryClient.invalidateQueries({ queryKey: ["companies-list"] });
      closeModal();
    },
    onError: (err: Error) => setFormError(err.message || "Failed to create company"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      apiFetch(`/companies/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      queryClient.invalidateQueries({ queryKey: ["companies-list"] });
      closeModal();
    },
    onError: (err: Error) => setFormError(err.message || "Failed to update company"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/companies/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      queryClient.invalidateQueries({ queryKey: ["companies-list"] });
    },
  });

  function openCreateModal() {
    setEditingCompany(null);
    setActiveFormTab("general");
    setName("");
    setLegalName("");
    setShortName("");
    setType("SUPPLIER");
    setIndustry("Technology");
    setIsActive(true);

    setEmail("");
    setPhone("");
    setContactPerson("");
    setWebsite("");

    setTaxId("");
    setPan("");
    setCin("");
    setMsme("");

    setStreet("");
    setCity("");
    setStateVal("");
    setZipCode("");
    setCountry("India");

    setSameAsBilling(true);
    setShipStreet("");
    setShipCity("");
    setShipStateVal("");
    setShipZipCode("");
    setShipCountry("India");

    setPaymentTerms("Net 30");
    setCreditLimit(0);
    setCurrency("INR");
    setNotes("");

    setFormError(null);
    setModalOpen(true);
  }

  function openEditModal(c: Company) {
    setEditingCompany(c);
    setActiveFormTab("general");
    setName(c.name || "");
    setLegalName(c.legalName || "");
    setShortName(c.shortName || "");
    setType(c.type || "SUPPLIER");
    setIndustry(c.industry || "Technology");
    setIsActive(c.isActive !== false);

    setEmail(c.email || "");
    setPhone(c.phone || "");
    setContactPerson(c.contactPerson || "");
    setWebsite(c.website || "");

    setTaxId(c.taxId || "");
    setPan(c.pan || "");
    setCin(c.cin || "");
    setMsme(c.msme || "");

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

    if (c.shippingAddress && typeof c.shippingAddress === "object") {
      setSameAsBilling(false);
      setShipStreet(c.shippingAddress.street || "");
      setShipCity(c.shippingAddress.city || "");
      setShipStateVal(c.shippingAddress.state || "");
      setShipZipCode(c.shippingAddress.zipCode || "");
      setShipCountry(c.shippingAddress.country || "India");
    } else {
      setSameAsBilling(true);
      setShipStreet("");
      setShipCity("");
      setShipStateVal("");
      setShipZipCode("");
      setShipCountry("India");
    }

    setPaymentTerms(c.paymentTerms || "Net 30");
    setCreditLimit(c.creditLimit || 0);
    setCurrency(c.currency || "INR");
    setNotes(c.notes || "");

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
      setFormError("Company name is required.");
      setActiveFormTab("general");
      return;
    }
    if (!email.trim()) {
      setFormError("Company email address is required.");
      setActiveFormTab("general");
      return;
    }
    if (!phone.trim()) {
      setFormError("Company phone number is required.");
      setActiveFormTab("general");
      return;
    }

    const payload = {
      name: name.trim(),
      legalName: legalName.trim() || undefined,
      shortName: shortName.trim() || undefined,
      type,
      industry: industry || "Technology",
      isActive,
      email: email.trim(),
      phone: phone.trim(),
      contactPerson: contactPerson.trim() || undefined,
      website: website.trim() || undefined,
      taxId: taxId.trim() || undefined,
      pan: pan.trim().toUpperCase() || undefined,
      cin: cin.trim().toUpperCase() || undefined,
      msme: msme.trim() || undefined,
      address: {
        street: street.trim() || "Headquarters",
        city: city.trim() || "Corporate City",
        state: stateVal.trim() || "State",
        zipCode: zipCode.trim() || "00000",
        country: country.trim() || "India",
      },
      shippingAddress: sameAsBilling
        ? {
            street: street.trim() || "Headquarters",
            city: city.trim() || "Corporate City",
            state: stateVal.trim() || "State",
            zipCode: zipCode.trim() || "00000",
            country: country.trim() || "India",
          }
        : {
            street: shipStreet.trim() || street.trim() || "Headquarters",
            city: shipCity.trim() || city.trim() || "Corporate City",
            state: shipStateVal.trim() || stateVal.trim() || "State",
            zipCode: shipZipCode.trim() || zipCode.trim() || "00000",
            country: shipCountry.trim() || country.trim() || "India",
          },
      paymentTerms,
      creditLimit: Number(creditLimit) || 0,
      currency: currency.split(" ")[0],
      notes: notes.trim() || undefined,
    };

    if (editingCompany) {
      updateMutation.mutate({ id: editingCompany._id, payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const filtered = companies.filter((c) => {
    if (typeFilter !== "ALL" && (c.type || "SUPPLIER") !== typeFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.legalName || "").toLowerCase().includes(q) ||
      (c.shortName || "").toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q) ||
      (c.taxId || "").toLowerCase().includes(q) ||
      (c.contactPerson || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 pb-28">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3.5 py-1 text-xs font-semibold text-amber-200">
            <span>🏢 Enterprise Master Data</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mt-1.5">
            Companies, Vendors & Partners
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Maintain compliance-grade supplier, vendor, and buyer records with GSTIN, PAN, and credit terms.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={openCreateModal}
            className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-300 to-orange-400 px-5 py-2.5 text-sm font-bold text-slate-950 shadow-lg shadow-amber-500/20 transition hover:scale-[1.02] active:scale-[0.98]"
          >
            <span>➕</span>
            <span>Add New Company</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-12 rounded-2xl border border-white/10 bg-slate-900/60 p-4 backdrop-blur-xl">
        <div className="sm:col-span-8 relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by company name, legal entity, GSTIN, code, or email..."
            className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2.5 pl-10 text-sm text-white outline-none placeholder:text-slate-500 focus:border-amber-400/50"
          />
          <svg className="absolute left-3 top-3 h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        <div className="sm:col-span-4 flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-400 whitespace-nowrap">Entity Type:</span>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2.5 text-xs text-white outline-none focus:border-amber-400/50"
          >
            <option value="ALL">All Entity Types ({companies.length})</option>
            <option value="SUPPLIER">Suppliers / Vendors</option>
            <option value="BUYER">Buyers / B2B Clients</option>
            <option value="MANUFACTURER">Manufacturers</option>
            <option value="PARTNER">Strategic Partners</option>
            <option value="CUSTOMER">Direct Customers</option>
          </select>
        </div>
      </div>

      {/* State Indicators */}
      {isLoading && <div className="p-12 text-center text-slate-400">Loading master company records…</div>}
      {error && (
        <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-5 text-sm text-rose-200">
          {(error as Error).message}
        </div>
      )}

      {/* Enterprise Company Table */}
      {!isLoading && !error && (
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/60 backdrop-blur-xl shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="border-b border-white/10 bg-slate-950/80 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-5 py-4">Company & Legal Name</th>
                  <th className="px-5 py-4">Type & Industry</th>
                  <th className="px-5 py-4">Tax ID / GSTIN</th>
                  <th className="px-5 py-4">Contact Person</th>
                  <th className="px-5 py-4">Credit & Payment Terms</th>
                  <th className="px-5 py-4">Registered Location</th>
                  <th className="px-5 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((c) => (
                  <tr key={c._id} className="transition hover:bg-white/5">
                    <td className="px-5 py-4">
                      <div className="font-bold text-white flex items-center gap-2">
                        <span>{c.name}</span>
                        {c.shortName && (
                          <span className="rounded border border-amber-400/20 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-amber-300">
                            {c.shortName}
                          </span>
                        )}
                      </div>
                      {c.legalName && <div className="text-xs text-slate-400 mt-0.5">Legal: {c.legalName}</div>}
                      {c.website && (
                        <a
                          href={c.website}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-sky-400 hover:underline inline-flex items-center gap-1 mt-0.5"
                        >
                          🌐 {c.website.replace(/^https?:\/\//, "")}
                        </a>
                      )}
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          c.type === "SUPPLIER"
                            ? "bg-amber-400/15 text-amber-300 border border-amber-400/30"
                            : c.type === "BUYER"
                            ? "bg-emerald-400/15 text-emerald-300 border border-emerald-400/30"
                            : c.type === "MANUFACTURER"
                            ? "bg-sky-400/15 text-sky-300 border border-sky-400/30"
                            : "bg-purple-400/15 text-purple-300 border border-purple-400/30"
                        }`}
                      >
                        {c.type || "SUPPLIER"}
                      </span>
                      <div className="text-[11px] text-slate-400 mt-1">{c.industry || "General Trade"}</div>
                    </td>

                    <td className="px-5 py-4 font-mono text-xs">
                      {c.taxId ? (
                        <div>
                          <span className="text-amber-300 font-semibold">{c.taxId}</span>
                          {c.pan && <div className="text-[10px] text-slate-400 font-mono">PAN: {c.pan}</div>}
                        </div>
                      ) : (
                        <span className="text-slate-500 italic">Not Registered</span>
                      )}
                    </td>

                    <td className="px-5 py-4 text-xs">
                      <div className="font-medium text-slate-200">{c.contactPerson || "Primary Contact"}</div>
                      <div className="text-slate-400">{c.email}</div>
                      <div className="text-slate-500 text-[11px]">{c.phone}</div>
                    </td>

                    <td className="px-5 py-4 text-xs">
                      <div className="font-semibold text-white">{c.paymentTerms || "Net 30"}</div>
                      {c.creditLimit ? (
                        <div className="text-emerald-400 font-mono text-[11px] mt-0.5">
                          Limit: ₹{c.creditLimit.toLocaleString("en-IN")}
                        </div>
                      ) : (
                        <div className="text-slate-500 text-[11px]">No Credit Limit</div>
                      )}
                    </td>

                    <td className="px-5 py-4 text-xs text-slate-400 max-w-xs truncate">
                      {formatAddress(c.address)}
                    </td>

                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(c)}
                          className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`Are you sure you want to delete company "${c.name}"?`)) {
                              deleteMutation.mutate(c._id);
                            }
                          }}
                          className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/20"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-slate-500">
                      No companies match your search criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Redesigned Enterprise Modal Form */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-6 backdrop-blur-md overflow-hidden">
          <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-3xl border border-white/15 bg-slate-900/95 shadow-2xl backdrop-blur-2xl text-slate-200 overflow-hidden">
            {/* Ambient background glow */}
            <div className="absolute right-0 top-0 -mr-20 -mt-20 h-60 w-60 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />

            {/* Modal Header (Pinned at top) */}
            <div className="flex-shrink-0 p-5 sm:p-7 pb-4 border-b border-white/10 bg-slate-900/95">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-400/10 text-xl shadow-inner">
                    🏢
                  </span>
                  <div>
                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                      {editingCompany ? `Edit Company: ${editingCompany.name}` : "Add Enterprise Company / Vendor"}
                    </h2>
                    <p className="text-xs text-slate-400">
                      Standard Zoho Books & SAP Business One organizational profile and compliance fields.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-400 hover:bg-white/10 hover:text-white"
                >
                  ✕
                </button>
              </div>

              {/* 4 Form Tabs */}
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                {[
                  { id: "general", label: "🏢 1. Core & Contacts" },
                  { id: "tax", label: "📋 2. Tax & Compliance" },
                  { id: "address", label: "📍 3. Addresses" },
                  { id: "financials", label: "💳 4. Terms & Credit" },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveFormTab(t.id as any)}
                    className={`rounded-xl px-3.5 py-1.5 font-semibold transition ${
                      activeFormTab === t.id
                        ? "bg-amber-400/20 text-amber-200 border border-amber-400/40 shadow-sm"
                        : "text-slate-400 hover:text-white hover:bg-white/5 border border-transparent"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-5">
              {formError && (
                <div className="rounded-xl border border-rose-400/30 bg-rose-950/60 p-3 text-xs text-rose-300">
                  ❌ {formError}
                </div>
              )}

              {/* TAB 1: CORE & CONTACTS */}
              {activeFormTab === "general" && (
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300">
                    General Company Information
                  </h3>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300">
                        Company / Trade Name <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Acme Tech Solutions"
                        className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2.5 text-sm text-white outline-none focus:border-amber-400/50"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300">
                        Legal Business Name (for GST / Invoices)
                      </label>
                      <input
                        type="text"
                        value={legalName}
                        onChange={(e) => setLegalName(e.target.value)}
                        placeholder="e.g. Acme Tech Solutions Private Limited"
                        className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2.5 text-sm text-white outline-none focus:border-amber-400/50"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300">Short Code / SKU Tag</label>
                      <input
                        type="text"
                        value={shortName}
                        onChange={(e) => setShortName(e.target.value.toUpperCase())}
                        placeholder="e.g. ACME"
                        className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2.5 text-sm uppercase text-white outline-none focus:border-amber-400/50"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300">Entity Type</label>
                      <select
                        value={type}
                        onChange={(e) => setType(e.target.value as any)}
                        className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2.5 text-sm text-white outline-none focus:border-amber-400/50"
                      >
                        <option value="SUPPLIER">Supplier / Vendor</option>
                        <option value="BUYER">Buyer / Customer</option>
                        <option value="MANUFACTURER">Manufacturer</option>
                        <option value="PARTNER">Strategic Partner</option>
                        <option value="CUSTOMER">Retail Customer</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300">Industry Vertical</label>
                      <select
                        value={industry}
                        onChange={(e) => setIndustry(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2.5 text-sm text-white outline-none focus:border-amber-400/50"
                      >
                        <option value="Technology">Technology & Electronics</option>
                        <option value="Manufacturing">Manufacturing & Heavy Industry</option>
                        <option value="Retail">Retail & E-commerce</option>
                        <option value="Healthcare">Healthcare & Pharma</option>
                        <option value="Construction">Construction & Logistics</option>
                        <option value="Other">Other Sector</option>
                      </select>
                    </div>
                  </div>

                  <h3 className="pt-2 text-xs font-bold uppercase tracking-wider text-amber-300">
                    Primary Communication Channels
                  </h3>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300">
                        Official Email <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="billing@acme.com"
                        className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2.5 text-sm text-white outline-none focus:border-amber-400/50"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300">
                        Phone Number <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+91 98765 43210"
                        className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2.5 text-sm text-white outline-none focus:border-amber-400/50"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300">Key Contact Person</label>
                      <input
                        type="text"
                        value={contactPerson}
                        onChange={(e) => setContactPerson(e.target.value)}
                        placeholder="e.g. Ramesh Kumar (Procurement Lead)"
                        className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2.5 text-sm text-white outline-none focus:border-amber-400/50"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300">Official Website URL</label>
                      <input
                        type="text"
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                        placeholder="https://acme.com"
                        className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2.5 text-sm text-white outline-none focus:border-amber-400/50"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: TAX & STATUTORY COMPLIANCE */}
              {activeFormTab === "tax" && (
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300">
                    Statutory & Tax Compliance (India / Global)
                  </h3>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300">
                        GSTIN / Value Added Tax (VAT) ID
                      </label>
                      <input
                        type="text"
                        value={taxId}
                        onChange={(e) => setTaxId(e.target.value.toUpperCase())}
                        placeholder="e.g. 27ABCDE1234F1Z5"
                        className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2.5 font-mono text-sm uppercase text-white outline-none focus:border-amber-400/50"
                      />
                      <p className="mt-1 text-[11px] text-slate-400">15-digit Indian GSTIN format for B2B e-invoicing.</p>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300">Permanent Account Number (PAN)</label>
                      <input
                        type="text"
                        value={pan}
                        onChange={(e) => setPan(e.target.value.toUpperCase())}
                        placeholder="e.g. ABCDE1234F"
                        className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2.5 font-mono text-sm uppercase text-white outline-none focus:border-amber-400/50"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300">
                        Corporate Identity Number (CIN)
                      </label>
                      <input
                        type="text"
                        value={cin}
                        onChange={(e) => setCin(e.target.value.toUpperCase())}
                        placeholder="e.g. U72200MH2020PTC123456"
                        className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2.5 font-mono text-sm uppercase text-white outline-none focus:border-amber-400/50"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300">
                        MSME / Udyam Registration No.
                      </label>
                      <input
                        type="text"
                        value={msme}
                        onChange={(e) => setMsme(e.target.value)}
                        placeholder="e.g. UDYAM-MH-01-0012345"
                        className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2.5 font-mono text-sm text-white outline-none focus:border-amber-400/50"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: ADDRESSES */}
              {activeFormTab === "address" && (
                <div className="space-y-5">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300">
                      Registered Headquarters & Billing Address
                    </h3>

                    <div className="mt-2 space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300">Street / Facility Address</label>
                        <input
                          type="text"
                          value={street}
                          onChange={(e) => setStreet(e.target.value)}
                          placeholder="e.g. Plot No. 42, Tech Industrial Zone"
                          className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2.5 text-sm text-white outline-none focus:border-amber-400/50"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <div>
                          <TypeaheadInput
                            label="State / Province"
                            value={stateVal}
                            onChange={(val) => setStateVal(val)}
                            options={ALL_INDIAN_STATES}
                            placeholder="Type or select State…"
                          />
                        </div>
                        <div>
                          <TypeaheadInput
                            label="City"
                            value={city}
                            onChange={(val) => setCity(val)}
                            options={billingCityOptions}
                            placeholder="Type or select City…"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1">PIN / Postal Code</label>
                          <input
                            type="text"
                            value={zipCode}
                            onChange={(e) => setZipCode(e.target.value)}
                            placeholder="400001"
                            className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-amber-400/50"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1">Country</label>
                          <input
                            type="text"
                            value={country}
                            onChange={(e) => setCountry(e.target.value)}
                            placeholder="India"
                            className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-amber-400/50"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-white/10 pt-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300">
                        Dispatch / Shipping Destination
                      </h3>
                      <label className="flex items-center gap-2 text-xs font-medium text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={sameAsBilling}
                          onChange={(e) => setSameAsBilling(e.target.checked)}
                          className="h-4 w-4 rounded border-white/20 bg-slate-950 text-amber-400"
                        />
                        <span>Same as Registered Billing Address</span>
                      </label>
                    </div>

                    {!sameAsBilling && (
                      <div className="mt-3 space-y-3 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-300">Warehouse / Dock Address</label>
                          <input
                            type="text"
                            value={shipStreet}
                            onChange={(e) => setShipStreet(e.target.value)}
                            placeholder="e.g. Inward Gate 3, Central Warehouse"
                            className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2 text-sm text-white outline-none focus:border-amber-400/50"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                          <div>
                            <TypeaheadInput
                              label="State"
                              value={shipStateVal}
                              onChange={(val) => setShipStateVal(val)}
                              options={ALL_INDIAN_STATES}
                              placeholder="Type or select State…"
                            />
                          </div>
                          <div>
                            <TypeaheadInput
                              label="City"
                              value={shipCity}
                              onChange={(val) => setShipCity(val)}
                              options={shippingCityOptions}
                              placeholder="Type or select City…"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-300 mb-1">PIN Code</label>
                            <input
                              type="text"
                              value={shipZipCode}
                              onChange={(e) => setShipZipCode(e.target.value)}
                              placeholder="421302"
                              className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-300 mb-1">Country</label>
                            <input
                              type="text"
                              value={shipCountry}
                              onChange={(e) => setShipCountry(e.target.value)}
                              placeholder="India"
                              className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 4: FINANCIALS & CREDIT TERMS */}
              {activeFormTab === "financials" && (
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300">
                    Commercial & Payment Terms
                  </h3>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300">Payment Terms</label>
                      <select
                        value={paymentTerms}
                        onChange={(e) => setPaymentTerms(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2.5 text-sm text-white outline-none focus:border-amber-400/50"
                      >
                        {PAYMENT_TERMS_OPTIONS.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300">Base Currency</label>
                      <select
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2.5 text-sm text-white outline-none focus:border-amber-400/50"
                      >
                        {CURRENCY_OPTIONS.map((curr) => (
                          <option key={curr} value={curr}>
                            {curr}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300">Credit Limit (₹)</label>
                      <input
                        type="number"
                        min="0"
                        value={creditLimit}
                        onChange={(e) => setCreditLimit(Number(e.target.value) || 0)}
                        placeholder="e.g. 500000"
                        className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2.5 text-sm text-white outline-none focus:border-amber-400/50"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300">Internal Audit & Operational Notes</label>
                    <textarea
                      rows={3}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Special delivery protocols, approved signatory names, or dock entry guidelines…"
                      className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 p-4 text-sm text-white outline-none focus:border-amber-400/50"
                    />
                  </div>
                </div>
              )}
            </form>

            {/* Modal Actions Footer (Sticky Bottom, never cut off!) */}
            <div className="flex-shrink-0 border-t border-white/10 bg-slate-950/95 p-4 sm:px-7 flex flex-wrap items-center justify-between gap-3 rounded-b-3xl">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancel
              </button>

              <div className="flex items-center gap-3">
                {activeFormTab !== "financials" ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (activeFormTab === "general") setActiveFormTab("tax");
                      else if (activeFormTab === "tax") setActiveFormTab("address");
                      else if (activeFormTab === "address") setActiveFormTab("financials");
                    }}
                    className="rounded-xl border border-white/10 bg-white/10 px-4 py-2.5 text-xs font-bold text-white hover:bg-white/15"
                  >
                    Next Section →
                  </button>
                ) : null}

                <button
                  type="button"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  onClick={handleSubmit}
                  className="rounded-xl bg-gradient-to-r from-amber-400 via-amber-300 to-orange-400 px-6 py-2.5 text-xs font-bold text-slate-950 shadow-lg shadow-amber-500/20 transition hover:scale-[1.02] disabled:opacity-50"
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? "Saving Company…"
                    : editingCompany
                    ? "Save Changes"
                    : "✓ Create Company Record"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
