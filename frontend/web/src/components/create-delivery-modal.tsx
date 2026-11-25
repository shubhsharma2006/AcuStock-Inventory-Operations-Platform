"use client";

import { useState, useEffect, useMemo } from "react";
import { apiFetch } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { TypeaheadInput } from "@/components/ui/typeahead-input";
import { ALL_INDIAN_STATES, INDIAN_STATES_AND_CITIES, TOP_ALL_INDIAN_CITIES } from "@/lib/india-geo-data";

type ProductItem = {
  _id: string;
  name: string;
  shortName?: string;
  sku?: string;
  currentStock?: number;
  uom?: string;
  price?: number;
  serialPolicy?: {
    enableSerial?: boolean;
    requireSerialOnOUT?: boolean;
  };
};

type CompanyItem = {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  gstin?: string;
  contactPerson?: string;
};

type TransporterItem = {
  _id: string;
  name: string;
  code: string;
  trackingUrlPattern?: string;
  phone?: string;
};

const CARRIER_OPTIONS = [
  { id: "PORTER", name: "Porter", tag: "Hyperlocal On-Demand", icon: "🛵", color: "from-cyan-500/20 to-blue-600/20 border-cyan-400/40 text-cyan-200" },
  { id: "SHIPROCKET", name: "Shiprocket", tag: "Book a courier pickup", icon: "📦", color: "border-sky-400/40 text-sky-200" },
  { id: "DELHIVERY", name: "Delhivery", tag: "Surface & Air Express", icon: "📦", color: "from-rose-500/20 to-orange-600/20 border-rose-400/40 text-rose-200" },
  { id: "DTDC", name: "DTDC Express", tag: "Domestic & Plus Cargo", icon: "⚡", color: "from-amber-500/20 to-yellow-600/20 border-amber-400/40 text-amber-200" },
  { id: "DMRC", name: "DMRC Transit", tag: "Metro Station Hub & Runner", icon: "🚇", color: "from-violet-500/20 to-purple-600/20 border-violet-400/40 text-violet-200" },
  { id: "BLUEDART", name: "Blue Dart", tag: "Priority Aviation Express", icon: "✈️", color: "from-blue-500/20 to-indigo-600/20 border-blue-400/40 text-blue-200" },
  { id: "IN_HOUSE", name: "In-House Fleet", tag: "Dedicated Company Van", icon: "🏢", color: "from-emerald-500/20 to-teal-600/20 border-emerald-400/40 text-emerald-200" },
];

const PORTER_VEHICLES = [
  "2-Wheeler ( документы / Under 20kg)",
  "3-Wheeler (Up to 500kg)",
  "Tata Ace (7ft / 750kg)",
  "Pickup 8ft (1000kg)",
  "Tata 407 (2.5 Ton)",
  "Other Local Carrier",
];

const WARRANTY_OPTIONS = [
  { id: "STANDARD", label: "Standard 1-Year Manufacturer Warranty" },
  { id: "EXTENDED_1YR", label: "Extended 2-Year Comprehensive Coverage" },
  { id: "EXTENDED_2YR", label: "Extended 3-Year Enterprise Care" },
  { id: "AMC", label: "Annual Maintenance Contract (AMC)" },
  { id: "NONE", label: "No Warranty / As-Is Sale" },
];

export function CreateDeliveryModal({
  isOpen,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (shipmentId: string) => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Queries
  const { data: productsData } = useQuery<{ items: ProductItem[] } | ProductItem[]>({
    queryKey: ["items-list"],
    queryFn: () => apiFetch("/items?limit=100"),
    enabled: isOpen,
  });

  const { data: companiesData } = useQuery<{ companies: CompanyItem[] } | CompanyItem[]>({
    queryKey: ["companies-list"],
    queryFn: () => apiFetch("/companies?limit=100"),
    enabled: isOpen,
  });

  const { data: transportersData } = useQuery<TransporterItem[]>({
    queryKey: ["transporters"],
    queryFn: () => apiFetch("/transporters"),
    enabled: isOpen,
  });

  const products: ProductItem[] = useMemo(() => {
    if (!productsData) return [];
    return Array.isArray(productsData) ? productsData : productsData.items || [];
  }, [productsData]);

  const companies: CompanyItem[] = useMemo(() => {
    if (!companiesData) return [];
    return Array.isArray(companiesData) ? companiesData : companiesData.companies || [];
  }, [companiesData]);

  const transporters: TransporterItem[] = transportersData || [];

  // Form State - Step 1: Product Details
  const [selectedProductId, setSelectedProductId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [model, setModel] = useState("");
  const [condition, setCondition] = useState<"New" | "Repair" | "Demo">("New");
  const [serialInput, setSerialInput] = useState("");
  const [boxes, setBoxes] = useState(1);
  const [weight, setWeight] = useState("");
  const [dimensions, setDimensions] = useState("");
  const [declaredValue, setDeclaredValue] = useState("");

  // Form State - Step 2: Company & Consignee Destination
  const [originWarehouse, setOriginWarehouse] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [companySearch, setCompanySearch] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  const [destinationGstin, setDestinationGstin] = useState("");

  const deliveryCityOptions = useMemo(() => {
    if (state && INDIAN_STATES_AND_CITIES[state]) {
      return INDIAN_STATES_AND_CITIES[state];
    }
    return TOP_ALL_INDIAN_CITIES;
  }, [state]);

  // Form State - Step 3: Warranty & Quality
  const [warrantyStatus, setWarrantyStatus] = useState("STANDARD");
  const [warrantyCardNo, setWarrantyCardNo] = useState("");
  const [tamperSealNo, setTamperSealNo] = useState("");
  const [isFragile, setIsFragile] = useState(false);
  const [insuranceValue, setInsuranceValue] = useState("");

  // Form State - Step 4: Carrier & Logistics
  const [carrierType, setCarrierType] = useState<string>("PORTER");
  const [transporterId, setTransporterId] = useState<string>("");
  const [courierName, setCourierName] = useState("Porter");
  const [deliveryType, setDeliveryType] = useState<"Prepaid" | "COD" | "ToPay">("Prepaid");
  const [prepaidAmount, setPrepaidAmount] = useState("");
  const [codAmount, setCodAmount] = useState("");
  const [courierCharges, setCourierCharges] = useState("");
  const [dispatchType, setDispatchType] = useState<"Standard" | "Express" | "Same Day">("Standard");
  const [dispatchDate, setDispatchDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [remarks, setRemarks] = useState("");

  // Porter Specific Fields
  const [porterVehicle, setPorterVehicle] = useState("Tata Ace (7ft / 750kg)");
  const [porterDriverName, setPorterDriverName] = useState("");
  const [porterDriverPhone, setPorterDriverPhone] = useState("");
  const [porterVehicleNumber, setPorterVehicleNumber] = useState("");
  const [porterPickupOtp, setPorterPickupOtp] = useState("");
  const [porterDeliveryOtp, setPorterDeliveryOtp] = useState("");
  const [porterFare, setPorterFare] = useState("");

  // Courier Specific Fields (Delhivery, DTDC, BlueDart, DMRC)
  const [awb, setAwb] = useState("");
  const [eWayBill, setEWayBill] = useState("");
  const [shippingMode, setShippingMode] = useState<"SURFACE" | "AIR" | "CARGO" | "EXPRESS">("SURFACE");
  const [dmrcStation, setDmrcStation] = useState("");
  const [dmrcGatePass, setDmrcGatePass] = useState("");

  // Auto-fill company details on selection
  function handleSelectCompany(comp: CompanyItem) {
    setSelectedCompanyId(comp._id);
    setCompanyName(comp.name);
    setCustomerName(comp.contactPerson || comp.name);
    setPhone(comp.phone || "");
    setEmail(comp.email || "");
    setAddress(comp.address || "");
    setCity(comp.city || "");
    setState(comp.state || "");
    setPincode(comp.pincode || "");
    setDestinationGstin(comp.gstin || "");
  }

  // Auto-fill product details on selection
  const selectedProduct = useMemo(
    () => products.find((p) => p._id === selectedProductId),
    [products, selectedProductId]
  );

  // Auto-select matched transporter ID when carrierType changes
  useEffect(() => {
    const matched = transporters.find((t) => t.code?.toUpperCase() === carrierType);
    if (matched) {
      setTransporterId(matched._id);
      setCourierName(matched.name);
    } else {
      setTransporterId("");
      setCourierName(carrierType === "PORTER" ? "Porter" : carrierType);
    }
  }, [carrierType, transporters]);

  if (!isOpen) return null;

  async function handleFinalSubmit() {
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const serials = serialInput
        .split(/[\n,]/)
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);

      const payload = {
        productId: selectedProductId,
        productName: selectedProduct?.name,
        model: model || selectedProduct?.shortName || "",
        quantity: Number(quantity),
        serialNumbers: serials,
        condition,
        boxes: Number(boxes) || 1,
        weight: weight ? `${weight} kg` : undefined,
        dimensions: dimensions || undefined,
        declaredValue: declaredValue ? Number(declaredValue) : undefined,

        // Consignee & Warehouse
        originWarehouse: originWarehouse.trim() || undefined,
        companyName,
        customerName: customerName || companyName,
        phone,
        email: email || undefined,
        address,
        city,
        state,
        pincode,
        destinationGstin: destinationGstin || undefined,

        // Warranty
        warrantyDetails: {
          status: warrantyStatus,
          warrantyCardNo: warrantyCardNo || undefined,
          tamperSealNo: tamperSealNo || undefined,
          isFragile,
          insuranceValue: insuranceValue ? Number(insuranceValue) : undefined,
        },

        // Logistics Carrier
        carrierType,
        courier: courierName,
        transporterId: transporterId || undefined,
        dispatchType,
        dispatchDate: carrierType === "SHIPROCKET" ? undefined : dispatchDate || new Date().toISOString(),
        deliveryType,
        prepaidAmount: deliveryType === "Prepaid" && prepaidAmount ? Number(prepaidAmount) : undefined,
        codAmount: deliveryType === "COD" && codAmount ? Number(codAmount) : undefined,
        courierCharges: courierCharges ? Number(courierCharges) : undefined,
        remarks: remarks || undefined,

        // Carrier Specific Details
        porterDetails:
          carrierType === "PORTER"
            ? {
                vehicleType: porterVehicle,
                driverName: porterDriverName || undefined,
                driverPhone: porterDriverPhone || undefined,
                vehicleNumber: porterVehicleNumber || undefined,
                pickupOtp: porterPickupOtp || undefined,
                deliveryOtp: porterDeliveryOtp || undefined,
                estimatedFare: porterFare ? Number(porterFare) : undefined,
              }
            : undefined,

        courierDetails:
          carrierType !== "PORTER"
            ? {
                shippingMode,
                eWayBill: eWayBill || undefined,
                gatePassNo: dmrcGatePass || undefined,
                transitStation: dmrcStation || undefined,
              }
            : undefined,

        awb: carrierType === "PORTER" ? (porterVehicleNumber || "PORTER-LOCAL") : carrierType === "SHIPROCKET" ? undefined : awb || undefined,
      };

      const res = await apiFetch<{ shipment: { _id: string } }>("/shipments", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (res.shipment?._id) {
        onSuccess(res.shipment._id);
        onClose();
      } else {
        throw new Error("Shipment created but no reference returned");
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to create delivery dispatch");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2 sm:p-4 backdrop-blur-md">
      <div className="relative w-full max-w-4xl max-h-[86vh] sm:max-h-[84vh] flex flex-col rounded-3xl border border-white/15 bg-slate-900/95 shadow-2xl backdrop-blur-2xl text-slate-200 overflow-hidden">
        {/* Glow ambient background element */}
        <div className="absolute right-0 top-0 -mr-20 -mt-20 h-60 w-60 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />

        {/* Modal Header & Stepper (Sticky Top) */}
        <div className="flex-shrink-0 p-4 sm:p-6 pb-3 border-b border-white/10 bg-slate-900/90 backdrop-blur-md z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-400/10 text-xl shadow-inner">
                🚚
              </span>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                  Create Delivery Dispatch
                </h2>
                <p className="text-xs text-slate-400">
                  Logistics manifest, carrier dispatching (Porter, Delhivery, DTDC, DMRC) & tracking.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-400 hover:bg-white/10 hover:text-white"
            >
              ✕
            </button>
          </div>

          {/* 5-Step Progress Stepper */}
          <div className="mt-4 grid grid-cols-5 gap-2 text-center text-xs">
            {[
              { num: 1, label: "1. Cargo & Items" },
              { num: 2, label: "2. Consignee" },
              { num: 3, label: "3. Warranty" },
              { num: 4, label: "4. Carrier Mode" },
              { num: 5, label: "5. Review & Authorize" },
            ].map((s) => (
              <button
                key={s.num}
                type="button"
                onClick={() => setStep(s.num as any)}
                className={`rounded-xl py-2 px-1 font-semibold transition ${
                  step === s.num
                    ? "bg-amber-400/20 text-amber-200 border border-amber-400/40 shadow-sm"
                    : step > s.num
                    ? "text-emerald-400 border border-emerald-400/20 bg-emerald-400/5"
                    : "text-slate-500 hover:text-slate-300 border border-transparent"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable Modal Content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Error message */}
          {errorMessage && (
            <div className="rounded-xl border border-rose-400/30 bg-rose-950/60 p-3 text-xs text-rose-300">
              ❌ {errorMessage}
            </div>
          )}

        {/* STEP 1: CARGO & ITEMS DETAILS */}
        {step === 1 && (
          <div className="mt-6 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-amber-300">
              Step 1: Select Products, Quantities & Packaging
            </h3>

            {/* Product selection search */}
            <div>
              <label className="block text-xs font-semibold text-slate-300">
                Product SKU / Name <span className="text-rose-400">*</span>
              </label>
              <div className="mt-1 flex gap-2">
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2.5 text-sm text-white outline-none focus:border-amber-400/40"
                >
                  <option value="">-- Choose Product from Catalog --</option>
                  {products.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name} {p.sku ? `(SKU: ${p.sku})` : ""} · Available: {p.currentStock ?? 0} {p.uom || "PCS"}
                    </option>
                  ))}
                </select>
              </div>
              {selectedProduct && (
                <div className="mt-2 flex items-center justify-between rounded-xl border border-white/5 bg-slate-950/40 p-2.5 text-xs text-slate-300">
                  <span>Available stock in ledger: <strong className="text-amber-300">{selectedProduct.currentStock ?? 0}</strong> {selectedProduct.uom || "PCS"}</span>
                  <span>Unit Price: ₹{selectedProduct.price || 0}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300">
                  Quantity to Dispatch <span className="text-rose-400">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2.5 text-sm text-white outline-none focus:border-amber-400/40"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300">Product Condition</label>
                <select
                  value={condition}
                  onChange={(e) => setCondition(e.target.value as any)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2.5 text-sm text-white outline-none focus:border-amber-400/40"
                >
                  <option value="New">Brand New (Sealed)</option>
                  <option value="Repair">Serviced / Refurbished</option>
                  <option value="Demo">Demo / Field Unit</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300">Declared Value (₹)</label>
                <input
                  type="number"
                  placeholder="e.g. 25000"
                  value={declaredValue}
                  onChange={(e) => setDeclaredValue(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2.5 text-sm text-white outline-none focus:border-amber-400/40"
                />
              </div>
            </div>

            {/* Serial numbers input */}
            <div>
              <label className="block text-xs font-semibold text-slate-300">
                Serial Numbers (Comma or newline separated)
              </label>
              <textarea
                rows={2}
                placeholder="e.g. SN-984210, SN-984211"
                value={serialInput}
                onChange={(e) => setSerialInput(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2 text-xs text-white outline-none focus:border-amber-400/40"
              />
              <span className="text-[11px] text-slate-500">
                Validated against current warehouse stock before dispatch.
              </span>
            </div>

            {/* Packaging specs */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 border-t border-white/5 pt-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300">Box Count / Packages</label>
                <input
                  type="number"
                  min="1"
                  value={boxes}
                  onChange={(e) => setBoxes(parseInt(e.target.value) || 1)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2 text-sm text-white outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300">Gross Weight (kg)</label>
                <input
                  type="text"
                  placeholder="e.g. 4.5"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2 text-sm text-white outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300">Dimensions (L x W x H cm)</label>
                <input
                  type="text"
                  placeholder="e.g. 30x20x15"
                  value={dimensions}
                  onChange={(e) => setDimensions(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2 text-sm text-white outline-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: CONSIGNEE & COMPANY DESTINATION */}
        {step === 2 && (
          <div className="mt-6 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-amber-300">
              Step 2: Source Origin & Recipient Consignee Details
            </h3>

            <div>
              <label className="block text-xs font-semibold text-slate-300">
                Origin Dispatch Warehouse / Branch
              </label>
              <input
                type="text"
                placeholder="Registered pickup location name"
                value={originWarehouse}
                onChange={(e) => setOriginWarehouse(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2 text-sm text-white outline-none"
              />
            </div>

            {/* Quick Auto-fill from Registered Companies */}
            <div>
              <label className="block text-xs font-semibold text-slate-300">
                Auto-fill from Registered Company Catalog
              </label>
              <select
                value={selectedCompanyId}
                onChange={(e) => {
                  const comp = companies.find((c) => c._id === e.target.value);
                  if (comp) handleSelectCompany(comp);
                }}
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2 text-sm text-white outline-none focus:border-amber-400/40"
              >
                <option value="">-- Choose Company to Auto-Fill Address & GSTIN --</option>
                {companies.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name} · {c.city || "India"} {c.gstin ? `(${c.gstin})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-300">
                  Recipient Company Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. Acme Industries Ltd."
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2 text-sm text-white outline-none focus:border-amber-400/40"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300">
                  Contact Person / Attn <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="e.g. Ankit Sharma"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2 text-sm text-white outline-none focus:border-amber-400/40"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300">
                  Phone Number <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="10-digit mobile number"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2 text-sm text-white outline-none focus:border-amber-400/40"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="consignee@company.com"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2 text-sm text-white outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300">Destination GSTIN</label>
                <input
                  type="text"
                  value={destinationGstin}
                  onChange={(e) => setDestinationGstin(e.target.value)}
                  placeholder="22AAAAA0000A1Z5"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2 text-sm text-white outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300">
                Delivery Street Address <span className="text-rose-400">*</span>
              </label>
              <textarea
                rows={2}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Plot No., Industrial Area, Landmark"
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2 text-sm text-white outline-none focus:border-amber-400/40"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <TypeaheadInput
                  label="State"
                  value={state}
                  onChange={(val) => setState(val)}
                  options={ALL_INDIAN_STATES}
                  placeholder="Type or select State…"
                />
              </div>
              <div>
                <TypeaheadInput
                  label="City"
                  value={city}
                  onChange={(val) => setCity(val)}
                  options={deliveryCityOptions}
                  placeholder="Type or select City…"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Pincode</label>
                <input
                  type="text"
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value)}
                  placeholder="110001"
                  className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: WARRANTY & COMPLIANCE */}
        {step === 3 && (
          <div className="mt-6 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-amber-300">
              Step 3: Warranty Registration & Fragile Cargo Checklist
            </h3>

            <div>
              <label className="block text-xs font-semibold text-slate-300">
                Product Warranty Coverage
              </label>
              <select
                value={warrantyStatus}
                onChange={(e) => setWarrantyStatus(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2.5 text-sm text-white outline-none focus:border-amber-400/40"
              >
                {WARRANTY_OPTIONS.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-300">
                  Warranty Certificate / Serial Card ID
                </label>
                <input
                  type="text"
                  value={warrantyCardNo}
                  onChange={(e) => setWarrantyCardNo(e.target.value)}
                  placeholder="e.g. WAR-2026-0091"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2 text-sm text-white outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300">
                  Security Tamper Seal Barcode
                </label>
                <input
                  type="text"
                  value={tamperSealNo}
                  onChange={(e) => setTamperSealNo(e.target.value)}
                  placeholder="e.g. SEAL-849102"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2 text-sm text-white outline-none"
                />
              </div>
            </div>

            {/* Fragile checklist banner */}
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isFragile}
                  onChange={(e) => setIsFragile(e.target.checked)}
                  className="mt-1 h-5 w-5 rounded accent-amber-400"
                />
                <div>
                  <div className="font-semibold text-white">
                    ⚠️ Fragile / High-Precision Equipment (Handle with Care)
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                    Flags shipment with high-visibility fragile labels on Delivery Challan and enforces gentle handling by transporters.
                  </p>
                </div>
              </label>

              {isFragile && (
                <div className="mt-4 pt-3 border-t border-white/10">
                  <label className="block text-xs font-semibold text-amber-200">
                    Declared Transit Insurance Valuation (₹)
                  </label>
                  <input
                    type="number"
                    value={insuranceValue}
                    onChange={(e) => setInsuranceValue(e.target.value)}
                    placeholder="Enter goods value insured against transit damage"
                    className="mt-1 w-full rounded-xl border border-amber-400/30 bg-slate-900 px-4 py-2 text-sm text-white outline-none"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 4: CARRIER & LOGISTICS (PORTER, DELHIVERY, DTDC, DMRC) */}
        {step === 4 && (
          <div className="mt-6 space-y-5">
            <h3 className="text-sm font-bold uppercase tracking-wider text-amber-300">
              Step 4: Select Logistics Partner & Delivery Mode
            </h3>

            {/* Carrier selection cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {CARRIER_OPTIONS.map((c) => {
                const isSelected = carrierType === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCarrierType(c.id)}
                    className={`flex flex-col items-start rounded-2xl border p-4 text-left transition ${
                      isSelected
                        ? `bg-gradient-to-br ${c.color} shadow-lg scale-[1.02]`
                        : "border-white/10 bg-slate-950/50 hover:bg-white/5"
                    }`}
                  >
                    <span className="text-2xl">{c.icon}</span>
                    <span className="mt-2 text-sm font-bold text-white">{c.name}</span>
                    <span className="text-[10px] text-slate-400 mt-0.5">{c.tag}</span>
                  </button>
                );
              })}
            </div>

            {/* DYNAMIC FIELDS: PORTER ON-DEMAND LOGISTICS */}
            {carrierType === "PORTER" && (
              <div className="rounded-2xl border border-cyan-400/30 bg-cyan-950/20 p-4 space-y-4">
                <div className="flex items-center gap-2 text-cyan-300 text-sm font-bold">
                  <span>🛵</span>
                  <span>Porter Hyperlocal Trip Details</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300">
                    Select Porter Vehicle Type
                  </label>
                  <select
                    value={porterVehicle}
                    onChange={(e) => setPorterVehicle(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2.5 text-sm text-white outline-none focus:border-cyan-400"
                  >
                    {PORTER_VEHICLES.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300">Driver Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Ramesh Kumar"
                      value={porterDriverName}
                      onChange={(e) => setPorterDriverName(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2 text-sm text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300">Driver Mobile No.</label>
                    <input
                      type="text"
                      placeholder="e.g. 9876543210"
                      value={porterDriverPhone}
                      onChange={(e) => setPorterDriverPhone(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2 text-sm text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300">Vehicle Number Plate</label>
                    <input
                      type="text"
                      placeholder="e.g. DL-01-AB-1234"
                      value={porterVehicleNumber}
                      onChange={(e) => setPorterVehicleNumber(e.target.value.toUpperCase())}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2 text-sm text-white outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300">Pickup OTP</label>
                    <input
                      type="text"
                      placeholder="e.g. 4821"
                      value={porterPickupOtp}
                      onChange={(e) => setPorterPickupOtp(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2 text-sm text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300">Delivery OTP</label>
                    <input
                      type="text"
                      placeholder="e.g. 9912"
                      value={porterDeliveryOtp}
                      onChange={(e) => setPorterDeliveryOtp(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2 text-sm text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300">Estimated Porter Fare (₹)</label>
                    <input
                      type="number"
                      placeholder="e.g. 450"
                      value={porterFare}
                      onChange={(e) => setPorterFare(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2 text-sm text-white outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* DYNAMIC FIELDS: DELHIVERY / DTDC / BLUEDART / DMRC */}
            {carrierType !== "PORTER" && (
              <div className="rounded-2xl border border-amber-400/30 bg-amber-950/20 p-4 space-y-4">
                <div className="flex items-center gap-2 text-amber-300 text-sm font-bold">
                  <span>📦</span>
                  <span>{carrierType} Waybill & Tracking Parameters</span>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300">
                      AWB / Consignment No.
                    </label>
                    <input
                      type="text"
                      placeholder={carrierType === "SHIPROCKET" ? "Assigned after booking" : "Carrier-issued number"}
                      disabled={carrierType === "SHIPROCKET"}
                      value={carrierType === "SHIPROCKET" ? "" : awb}
                      onChange={(e) => setAwb(e.target.value.toUpperCase())}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2 text-sm text-white outline-none focus:border-amber-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300">Shipping Mode</label>
                    <select
                      value={shippingMode}
                      onChange={(e) => setShippingMode(e.target.value as any)}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2 text-sm text-white outline-none"
                    >
                      <option value="SURFACE">Surface Roadways (Heavy)</option>
                      <option value="AIR">Air Express (Priority)</option>
                      <option value="CARGO">Cargo Freight</option>
                      <option value="EXPRESS">Same-Day Express</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300">GST E-Way Bill Number</label>
                    <input
                      type="text"
                      placeholder="12-digit E-Way Bill"
                      value={eWayBill}
                      onChange={(e) => setEWayBill(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2 text-sm text-white outline-none"
                    />
                  </div>
                </div>

                {carrierType === "DMRC" && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 pt-2 border-t border-white/5">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300">
                        Metro Station Transit Hub
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Kashmere Gate Metro Hub"
                        value={dmrcStation}
                        onChange={(e) => setDmrcStation(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2 text-sm text-white outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300">
                        Transit Gate Pass / Token No.
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. DMRC-GATE-04"
                        value={dmrcGatePass}
                        onChange={(e) => setDmrcGatePass(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2 text-sm text-white outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Payment & Dispatch Terms */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 border-t border-white/5 pt-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300">
                  Payment / Billing Type <span className="text-rose-400">*</span>
                </label>
                <select
                  value={deliveryType}
                  onChange={(e) => setDeliveryType(e.target.value as any)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2 text-sm text-white outline-none"
                >
                  <option value="Prepaid">Prepaid (Invoice Cleared)</option>
                  <option value="COD">Cash on Delivery (COD)</option>
                  <option value="ToPay">To-Pay (Freight on Delivery)</option>
                </select>
              </div>

              {carrierType === "SHIPROCKET" && deliveryType === "Prepaid" && <label className="text-xs text-slate-300">Prepaid order value (₹)
                <input type="number" min="0.01" step="0.01" value={prepaidAmount} onChange={e => setPrepaidAmount(e.target.value)}
                  className="mt-1 block w-full rounded-xl border border-white/10 bg-slate-950 p-2" />
              </label>}
              {deliveryType === "COD" && (
                <div>
                  <label className="block text-xs font-semibold text-amber-300">
                    COD Amount to Collect (₹)
                  </label>
                  <input
                    type="number"
                    value={codAmount}
                    onChange={(e) => setCodAmount(e.target.value)}
                    placeholder="Enter cash amount"
                    className="mt-1 w-full rounded-xl border border-amber-400/30 bg-slate-950/70 px-4 py-2 text-sm text-white outline-none"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300">Dispatch Date</label>
                <input
                  type="date"
                  value={dispatchDate}
                  onChange={(e) => setDispatchDate(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2 text-sm text-white outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300">Dispatch Remarks / Driver Notes</label>
              <input
                type="text"
                placeholder="e.g. Call customer before arrival; Gate entry permission required"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2 text-sm text-white outline-none"
              />
            </div>
          </div>
        )}

        {/* STEP 5: REVIEW MANIFEST & DISPATCH */}
        {step === 5 && (
          <div className="mt-6 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-amber-300">
              Step 5: Review Manifest & Authorize Shipment
            </h3>

            <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
                <div>
                  <div className="text-xs text-slate-400">Carrier Selected</div>
                  <div className="text-base font-bold text-white flex items-center gap-2 mt-0.5">
                    <span>{CARRIER_OPTIONS.find((c) => c.id === carrierType)?.icon}</span>
                    <span>{courierName}</span>
                    <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
                      {deliveryType}
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs text-slate-400">Dispatch Status</div>
                  <div className="text-sm font-bold text-emerald-400">Ready to Book & Disown Stock</div>
                </div>
              </div>

              {/* Manifest 2-column breakdown */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-xs">
                <div className="space-y-1.5 rounded-xl border border-white/5 bg-slate-900/60 p-3">
                  <div className="font-bold text-slate-200">📦 Cargo Details:</div>
                  <div>Item: <strong className="text-white">{selectedProduct?.name || "Selected Product"}</strong></div>
                  <div>Quantity: <strong className="text-amber-300">{quantity} {selectedProduct?.uom || "PCS"}</strong></div>
                  <div>Boxes: <strong>{boxes}</strong> · Weight: <strong>{weight || "N/A"} kg</strong></div>
                  {isFragile && <div className="text-rose-300 font-bold">⚠️ Fragile Equipment Handling</div>}
                </div>

                <div className="space-y-1.5 rounded-xl border border-white/5 bg-slate-900/60 p-3">
                  <div className="font-bold text-slate-200">🏢 Consignee Details:</div>
                  <div>Company: <strong className="text-white">{companyName}</strong></div>
                  <div>Contact: <strong>{customerName} ({phone})</strong></div>
                  <div>Destination: <strong>{city}, {state} - {pincode}</strong></div>
                  {destinationGstin && <div>GSTIN: <span className="font-mono text-slate-400">{destinationGstin}</span></div>}
                </div>
              </div>

              {/* Carrier Specific Review */}
              {carrierType === "PORTER" ? (
                <div className="rounded-xl border border-cyan-400/20 bg-cyan-950/30 p-3 text-xs text-cyan-200 space-y-1">
                  <div className="font-bold">🛵 Porter Hyperlocal Execution:</div>
                  <div>Vehicle: <strong>{porterVehicle}</strong> · Plate: <strong>{porterVehicleNumber || "TBD"}</strong></div>
                  <div>Driver: <strong>{porterDriverName || "Assigned on dispatch"} ({porterDriverPhone || "N/A"})</strong></div>
                  {porterPickupOtp && <div>Pickup OTP: <strong className="font-mono text-amber-300">{porterPickupOtp}</strong></div>}
                  {porterFare && <div>Estimated Fare: <strong className="text-emerald-300">₹{porterFare}</strong></div>}
                </div>
              ) : (
                <div className="rounded-xl border border-amber-400/20 bg-amber-950/30 p-3 text-xs text-amber-200 space-y-1">
                  <div className="font-bold">📦 Waybill Tracking:</div>
                  <div>AWB: <strong className="font-mono text-white">{carrierType === "SHIPROCKET" ? "Awaiting carrier booking" : awb || "Unassigned"}</strong> · Mode: <strong>{shippingMode}</strong></div>
                  {eWayBill && <div>E-Way Bill: <strong className="font-mono">{eWayBill}</strong></div>}
                </div>
              )}
            </div>
          </div>
        )}

        </div>

        {/* Modal Stepper Navigation Controls (Sticky Footer) */}
        <div className="flex-shrink-0 border-t border-white/10 bg-slate-950/95 p-4 sm:px-7 flex flex-wrap items-center justify-between gap-3 rounded-b-3xl">
          <div>
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((s) => (s - 1) as any)}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-semibold text-slate-300 transition hover:bg-white/10"
              >
                ← Previous Step
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-semibold text-slate-400 hover:text-white"
            >
              Cancel
            </button>

            {step < 5 ? (
              <button
                type="button"
                onClick={() => {
                  if (step === 1 && !selectedProductId) {
                    setErrorMessage("Please select a product from the catalog.");
                    return;
                  }
                  if (step === 2 && (!companyName || !phone || !address)) {
                    setErrorMessage("Please fill required company, contact, and address fields.");
                    return;
                  }
                  setErrorMessage(null);
                  setStep((s) => (s + 1) as any);
                }}
                className="rounded-xl bg-gradient-to-r from-amber-400 to-orange-400 px-6 py-2.5 text-xs font-bold text-slate-950 shadow-md transition hover:from-amber-300 hover:to-orange-300"
              >
                Next Step →
              </button>
            ) : (
              <button
                type="button"
                disabled={submitting}
                onClick={handleFinalSubmit}
                className="rounded-xl bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-500 px-7 py-2.5 text-xs font-bold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:scale-[1.02] disabled:opacity-50"
              >
                {submitting ? "Executing Dispatch…" : "✓ Authorize & Dispatch Shipment"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

