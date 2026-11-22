'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

interface CountryRule {
  name: string;
  currency: string;
  exchangeRateInr: number;
  deMinimisUsd: number;
  avgDutyRate: number;
  vatGstRate: number;
  requiresTaxId: boolean;
  transitDays: string;
}

interface CarrierQuote {
  carrierKey: string;
  carrierName: string;
  chargeableWeightKg: number;
  grossWeightKg: number;
  volumetricWeightKg: number;
  breakdown: {
    baseFreight: number;
    fuelSurcharge: number;
    securityAndDocFee: number;
    netFreightInr: number;
    dutiesTaxesInr: number;
  };
  totalPayableInr: number;
  transitDays: string;
  reliabilityScore: number;
  speedBadge: string;
  incoterm: string;
}

interface CrossBorderShipmentRecord {
  _id: string;
  shipmentReference: string;
  awb: string;
  carrier: string;
  incoterm: 'DAP' | 'DDP';
  exportType: string;
  status: string;
  consigneeDetails: {
    fullName: string;
    companyName?: string;
    email: string;
    phone: string;
    taxId?: string;
    address: {
      street: string;
      city: string;
      stateProvince?: string;
      postalCode: string;
      countryCode: string;
    };
  };
  customsDeclaration: {
    csbType: string;
    csbNumber: string;
    portOfExport: string;
    estimatedDutyTax: number;
    deMinimisExceeded: boolean;
  };
  financials: {
    totalCharges: number;
    billingCurrency: string;
  };
  createdAt: string;
}

interface CommercialInvoicePayload {
  title: string;
  invoiceNumber: string;
  date: string;
  awb: string;
  carrier: string;
  incoterm: string;
  csbNumber: string;
  exporter: {
    companyName: string;
    iec: string;
    adCode: string;
    gstin: string;
    pan: string;
    lutNumber: string;
    address: {
      street: string;
      city: string;
      state: string;
      postalCode: string;
      country: string;
    };
  };
  consignee: {
    fullName: string;
    companyName?: string;
    email: string;
    phone: string;
    taxId?: string;
    address: {
      street: string;
      city: string;
      postalCode: string;
      countryCode: string;
    };
  };
  items: Array<{
    description: string;
    hsCode: string;
    quantity: number;
    unitPrice: number;
    totalValue: number;
    currency: string;
    countryOfOrigin: string;
  }>;
  totalQuantity: number;
  totalInvoiceValue: number;
  currency: string;
  declaration: string;
}

export default function CrossBorderPage() {
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'CALCULATOR' | 'SHIPMENTS'>('CALCULATOR');
  const [notificationBanner, setNotificationBanner] = useState<string | null>(null);

  // Rate Calculator State
  const [destinationCountry, setDestinationCountry] = useState('US');
  const [incoterm, setIncoterm] = useState<'DAP' | 'DDP'>('DAP');
  const [packageWeight, setPackageWeight] = useState('2.5');
  const [pkgLength, setPkgLength] = useState('30');
  const [pkgWidth, setPkgWidth] = useState('25');
  const [pkgHeight, setPkgHeight] = useState('15');

  // Export Item State
  const [itemDescription, setItemDescription] = useState('Precision Ball Bearings & Assembly');
  const [itemHsCode, setItemHsCode] = useState('84821011');
  const [itemQuantity, setItemQuantity] = useState('10');
  const [itemUnitPrice, setItemUnitPrice] = useState('25');

  // Consignee State
  const [consigneeName, setConsigneeName] = useState('Alex Mercer');
  const [consigneeCompany, setConsigneeCompany] = useState('Apex Industrial Global Ltd');
  const [consigneeEmail, setConsigneeEmail] = useState('procurement@apexindustrial.com');
  const [consigneePhone, setConsigneePhone] = useState('+1 415 555 9812');
  const [consigneeTaxId, setConsigneeTaxId] = useState('EIN-98-7654321');
  const [consigneeStreet, setConsigneeStreet] = useState('450 Mission Street, Floor 14');
  const [consigneeCity, setConsigneeCity] = useState('San Francisco');
  const [consigneePostalCode, setConsigneePostalCode] = useState('94105');

  // Rates Quote Results State
  const [quotesResult, setQuotesResult] = useState<any | null>(null);

  // Modal State for Commercial Invoice
  const [viewInvoiceModal, setViewInvoiceModal] = useState<CommercialInvoicePayload | null>(null);

  // 1. Fetch Country Rules
  const { data: rulesData } = useQuery<{ success: boolean; countries: Record<string, CountryRule> }>({
    queryKey: ['cross-border-countries'],
    queryFn: () => apiFetch('/cross-border/country-rules')
  });

  // 2. Fetch Export Shipments
  const { data: shipmentsData, isLoading: loadingShipments } = useQuery<{
    success: boolean;
    shipments: CrossBorderShipmentRecord[];
    total: number;
  }>({
    queryKey: ['cross-border-shipments'],
    queryFn: () => apiFetch('/cross-border/shipments'),
    refetchInterval: 30_000
  });

  const selectedCountryRule = rulesData?.countries?.[destinationCountry];

  // Volumetric Weight Real-time Calculation
  const calculatedVolWeight = Number(
    ((Number(pkgLength) * Number(pkgWidth) * Number(pkgHeight)) / 5000).toFixed(2)
  );
  const totalItemValUsd = Number(itemQuantity) * Number(itemUnitPrice);

  // Rate Quotes Mutation
  const ratesMutation = useMutation({
    mutationFn: (body: any) => apiFetch('/cross-border/rate-calculator', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (data: any) => {
      setQuotesResult(data);
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to calculate cross-border rates');
    }
  });

  // Book Shipment Mutation
  const bookMutation = useMutation({
    mutationFn: (body: any) => apiFetch('/cross-border/book', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (data: any) => {
      setNotificationBanner(data.message || 'International shipment booked successfully!');
      queryClient.invalidateQueries({ queryKey: ['cross-border-shipments'] });
      queryClient.invalidateQueries({ queryKey: ['logistics-wallet'] });
      setActiveTab('SHIPMENTS');
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to book export shipment');
    }
  });

  const handleCalculateRates = (e: React.FormEvent) => {
    e.preventDefault();
    ratesMutation.mutate({
      destinationCountry,
      incoterm,
      packages: [
        {
          weightKg: Number(packageWeight),
          lengthCm: Number(pkgLength),
          widthCm: Number(pkgWidth),
          heightCm: Number(pkgHeight)
        }
      ],
      items: [
        {
          description: itemDescription,
          hsCode: itemHsCode,
          quantity: Number(itemQuantity),
          unitPrice: Number(itemUnitPrice),
          totalValue: totalItemValUsd,
          currency: 'USD',
          countryOfOrigin: 'IN'
        }
      ]
    });
  };

  const handleBookCarrier = (carrierKey: string) => {
    bookMutation.mutate({
      carrier: carrierKey,
      incoterm,
      exportType: 'COMMERCIAL',
      destinationCountry,
      consigneeDetails: {
        fullName: consigneeName,
        companyName: consigneeCompany,
        email: consigneeEmail,
        phone: consigneePhone,
        taxId: consigneeTaxId,
        address: {
          street: consigneeStreet,
          city: consigneeCity,
          postalCode: consigneePostalCode,
          countryCode: destinationCountry
        }
      },
      packages: [
        {
          weightKg: Number(packageWeight),
          lengthCm: Number(pkgLength),
          widthCm: Number(pkgWidth),
          heightCm: Number(pkgHeight)
        }
      ],
      items: [
        {
          description: itemDescription,
          hsCode: itemHsCode,
          quantity: Number(itemQuantity),
          unitPrice: Number(itemUnitPrice),
          totalValue: totalItemValUsd,
          currency: 'USD',
          countryOfOrigin: 'IN'
        }
      ]
    });
  };

  const handleOpenCommercialInvoice = async (shipmentId: string) => {
    try {
      const res = await apiFetch<{ success: boolean; payload: CommercialInvoicePayload }>(`/cross-border/commercial-invoice/${shipmentId}`);
      if (res.success && res.payload) {
        setViewInvoiceModal(res.payload);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to load commercial invoice');
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Title Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
              Cross-Border International Shipping & Customs Engine
            </h1>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
              CSB-V Commercial Exports
            </span>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Global express shipping via DHL, FedEx, Aramex, and UPS. Automated Indian Customs CSB-V manifest, ITC-HS code classification, De Minimis thresholds, and Incoterms (DAP / DDP).
          </p>
        </div>

        {/* Global Action Badges */}
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 text-xs font-medium rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
            Export Airport: <strong className="font-mono">INDEL4 (IGI Cargo)</strong>
          </span>
          <span className="px-3 py-1 text-xs font-medium rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
            LUT GST Exemption: <strong className="text-emerald-600">Active</strong>
          </span>
        </div>
      </div>

      {/* Notification Banner */}
      {notificationBanner && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-200 flex justify-between items-center text-sm shadow-sm">
          <span>{notificationBanner}</span>
          <button onClick={() => setNotificationBanner(null)} className="text-emerald-600 hover:underline text-xs">
            Dismiss
          </button>
        </div>
      )}

      {/* Hero Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total Export Shipments</div>
          <div className="text-2xl font-black text-gray-900 dark:text-white mt-1">
            {shipmentsData?.total ?? 0} Consignments
          </div>
          <div className="text-xs text-gray-500 mt-2">Global Air Express Network</div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">CSB-V Manifested</div>
          <div className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">
            100% Cleared
          </div>
          <div className="text-xs text-blue-600 mt-2 font-medium">CBIC ECCS Compliant</div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">De Minimis Safeguard</div>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
            US $800 / UK £135
          </div>
          <div className="text-xs text-gray-500 mt-2">Zero-Duty Optimization</div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Incoterm Support</div>
          <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1">
            DAP & DDP
          </div>
          <div className="text-xs text-gray-500 mt-2">Prepaid vs Collect Customs</div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 space-x-6">
        <button
          onClick={() => setActiveTab('CALCULATOR')}
          className={`pb-3 text-sm font-semibold border-b-2 transition ${
            activeTab === 'CALCULATOR'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Book International Shipment & Rate Engine
        </button>

        <button
          onClick={() => setActiveTab('SHIPMENTS')}
          className={`pb-3 text-sm font-semibold border-b-2 transition ${
            activeTab === 'SHIPMENTS'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Export Shipments & CSB-V Manifests ({shipmentsData?.total ?? 0})
        </button>
      </div>

      {/* TAB 1: BOOKING & RATE ENGINE */}
      {activeTab === 'CALCULATOR' && (
        <div className="space-y-6">
          <form
            onSubmit={handleCalculateRates}
            className="p-6 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm space-y-6"
          >
            <div className="border-b border-gray-100 dark:border-gray-700 pb-4">
              <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <span>✈️</span> International Cargo & Customs Compliance
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Configure destination country, cargo dimensions, ITC-HS code declaration, and Incoterm selection.
              </p>
            </div>

            {/* Row 1: Destination & Incoterm */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Destination Country
                </label>
                <select
                  value={destinationCountry}
                  onChange={(e) => setDestinationCountry(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="US">🇺🇸 United States (USD)</option>
                  <option value="GB">🇬🇧 United Kingdom (GBP)</option>
                  <option value="AE">🇦🇪 United Arab Emirates (AED)</option>
                  <option value="DE">🇩🇪 Germany / European Union (EUR)</option>
                  <option value="AU">🇦🇺 Australia (AUD)</option>
                  <option value="CA">🇨🇦 Canada (CAD)</option>
                  <option value="SG">🇸🇬 Singapore (SGD)</option>
                </select>

                {selectedCountryRule && (
                  <div className="mt-2 text-[11px] text-gray-500 space-y-0.5">
                    <div>
                      • De Minimis: <strong>${selectedCountryRule.deMinimisUsd} USD</strong>
                    </div>
                    <div>
                      • Transit Time: <strong>{selectedCountryRule.transitDays}</strong>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Incoterm (Shipping Terms)
                </label>
                <select
                  value={incoterm}
                  onChange={(e) => setIncoterm(e.target.value as 'DAP' | 'DDP')}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="DAP">DAP (Delivered at Place - Buyer Pays Duties)</option>
                  <option value="DDP">DDP (Delivered Duty Paid - Merchant Pays Upfront)</option>
                </select>
                <p className="text-[11px] text-gray-500 mt-1">
                  {incoterm === 'DAP'
                    ? 'Customer pays customs duty and local VAT directly to the carrier before delivery.'
                    : 'All estimated duties and taxes are prepaid by merchant from the wallet, ensuring friction-free doorstep delivery.'}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Indian Customs Export Bill
                </label>
                <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 text-xs">
                  <div className="font-semibold text-gray-800 dark:text-gray-200">CSB-V (Courier Shipping Bill)</div>
                  <div className="text-gray-500 text-[11px]">Commercial cargo eligible for export incentives & FIRC</div>
                </div>
              </div>
            </div>

            {/* Row 2: Package Weight & Dimensions */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Gross Weight (Kg)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={packageWeight}
                  onChange={(e) => setPackageWeight(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Length (cm)
                </label>
                <input
                  type="number"
                  min="1"
                  value={pkgLength}
                  onChange={(e) => setPkgLength(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Width (cm)
                </label>
                <input
                  type="number"
                  min="1"
                  value={pkgWidth}
                  onChange={(e) => setPkgWidth(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Height (cm)
                </label>
                <input
                  type="number"
                  min="1"
                  value={pkgHeight}
                  onChange={(e) => setPkgHeight(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                />
              </div>

              <div className="sm:col-span-4 flex items-center justify-between text-xs pt-1 border-t border-gray-200 dark:border-gray-700">
                <span className="text-gray-500">
                  IATA Air Divisor: <strong>5000</strong> • Volumetric Weight: <strong>{calculatedVolWeight} kg</strong>
                </span>
                <span className="font-semibold text-blue-600 dark:text-blue-400">
                  Chargeable Weight: {Math.max(Number(packageWeight), calculatedVolWeight)} kg
                </span>
              </div>
            </div>

            {/* Row 3: Export Line Items & HS Code */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Product Description
                </label>
                <input
                  type="text"
                  value={itemDescription}
                  onChange={(e) => setItemDescription(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  ITC-HS Code (Harmonized)
                </label>
                <input
                  type="text"
                  value={itemHsCode}
                  onChange={(e) => setItemHsCode(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Qty & Unit Price (USD)
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="1"
                    value={itemQuantity}
                    onChange={(e) => setItemQuantity(e.target.value)}
                    className="w-1/2 px-2 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                  />
                  <input
                    type="number"
                    min="1"
                    value={itemUnitPrice}
                    onChange={(e) => setItemUnitPrice(e.target.value)}
                    className="w-1/2 px-2 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                  />
                </div>
              </div>
            </div>

            {/* Consignee Recipient Details Card */}
            <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 space-y-3">
              <h3 className="text-xs font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wider">
                Consignee / International Buyer Details
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  placeholder="Full Name"
                  value={consigneeName}
                  onChange={(e) => setConsigneeName(e.target.value)}
                  className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                />
                <input
                  type="text"
                  placeholder="Company Name (Optional)"
                  value={consigneeCompany}
                  onChange={(e) => setConsigneeCompany(e.target.value)}
                  className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={consigneeEmail}
                  onChange={(e) => setConsigneeEmail(e.target.value)}
                  className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                />
                <input
                  type="text"
                  placeholder="Phone"
                  value={consigneePhone}
                  onChange={(e) => setConsigneePhone(e.target.value)}
                  className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                />
                <input
                  type="text"
                  placeholder="Street Address"
                  value={consigneeStreet}
                  onChange={(e) => setConsigneeStreet(e.target.value)}
                  className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="City"
                    value={consigneeCity}
                    onChange={(e) => setConsigneeCity(e.target.value)}
                    className="w-1/2 px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                  />
                  <input
                    type="text"
                    placeholder="Postal Code"
                    value={consigneePostalCode}
                    onChange={(e) => setConsigneePostalCode(e.target.value)}
                    className="w-1/2 px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={ratesMutation.isPending}
                className="px-6 py-2.5 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition shadow disabled:opacity-50"
              >
                {ratesMutation.isPending ? 'Calculating International Rates...' : 'Get Carrier Rates & Customs Estimates'}
              </button>
            </div>
          </form>

          {/* Carrier Quotes Comparison Cards */}
          {quotesResult && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-white">
                    Available Carrier Air Quotes ({quotesResult.destinationCountry})
                  </h3>
                  <p className="text-xs text-gray-500">
                    Chargeable Weight: <strong>{quotesResult.chargeableWeightKg} kg</strong> • Incoterm:{' '}
                    <strong>{quotesResult.customs.incoterm}</strong> • Customs Duty Payer:{' '}
                    <strong>{quotesResult.customs.dutyPayer}</strong>
                  </p>
                </div>
                {quotesResult.customs.isDeMinimisExceeded ? (
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    ⚠️ De Minimis Exceeded (&gt; ${quotesResult.customs.deMinimisThresholdUsd})
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    ✓ Duty-Free De Minimis (&lt; ${quotesResult.customs.deMinimisThresholdUsd})
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {quotesResult.carrierQuotes.map((quote: CarrierQuote) => (
                  <div
                    key={quote.carrierKey}
                    className="p-5 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col justify-between hover:border-blue-500 transition"
                  >
                    <div className="space-y-3">
                      <div className="flex justify-between items-start">
                        <span className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wide">
                          {quote.speedBadge}
                        </span>
                        <span className="text-[11px] font-semibold text-emerald-600">
                          {quote.reliabilityScore}% On-Time
                        </span>
                      </div>

                      <div>
                        <div className="text-base font-bold text-gray-900 dark:text-white">
                          {quote.carrierName}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">{quote.transitDays}</div>
                      </div>

                      {/* Financial Breakdown */}
                      <div className="space-y-1 text-xs text-gray-600 dark:text-gray-300 pt-2 border-t border-gray-100 dark:border-gray-700">
                        <div className="flex justify-between">
                          <span>Base Air Freight:</span>
                          <span>₹{quote.breakdown.baseFreight.toLocaleString('en-IN')}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Fuel & Docket:</span>
                          <span>₹{(quote.breakdown.fuelSurcharge + quote.breakdown.securityAndDocFee).toLocaleString('en-IN')}</span>
                        </div>
                        {quote.breakdown.dutiesTaxesInr > 0 && (
                          <div className="flex justify-between text-amber-600 font-semibold">
                            <span>Prepaid Customs (DDP):</span>
                            <span>₹{quote.breakdown.dutiesTaxesInr.toLocaleString('en-IN')}</span>
                          </div>
                        )}
                        <div className="flex justify-between font-bold text-sm text-gray-900 dark:text-white pt-1 border-t border-gray-100 dark:border-gray-700">
                          <span>Total Payable:</span>
                          <span>₹{quote.totalPayableInr.toLocaleString('en-IN')}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleBookCarrier(quote.carrierKey)}
                      disabled={bookMutation.isPending}
                      className="mt-4 w-full py-2 text-xs font-bold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition shadow disabled:opacity-50"
                    >
                      {bookMutation.isPending ? 'Booking...' : 'Book & Debit Wallet'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SHIPMENTS & CSB-V MANIFESTS */}
      {activeTab === 'SHIPMENTS' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900/50 text-xs font-semibold text-gray-500 uppercase">
                  <tr>
                    <th className="p-3">Export Ref / AWB</th>
                    <th className="p-3">Destination</th>
                    <th className="p-3">Carrier</th>
                    <th className="p-3">Terms</th>
                    <th className="p-3">CSB-V Number</th>
                    <th className="p-3 text-right">Freight Charges (₹)</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3 text-center">Customs Docs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {(!shipmentsData?.shipments || shipmentsData.shipments.length === 0) ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-gray-400">
                        No international export shipments booked yet. Calculate rates and book in Tab 1.
                      </td>
                    </tr>
                  ) : (
                    shipmentsData.shipments.map((s) => (
                      <tr key={s._id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/30">
                        <td className="p-3">
                          <div className="font-mono text-xs font-bold text-gray-900 dark:text-white">
                            {s.shipmentReference}
                          </div>
                          <div className="font-mono text-[11px] text-blue-600 dark:text-blue-400">
                            AWB: {s.awb}
                          </div>
                        </td>
                        <td className="p-3 text-xs">
                          <div className="font-semibold text-gray-800 dark:text-gray-200">
                            {s.consigneeDetails?.fullName}
                          </div>
                          <div className="text-gray-500">
                            {s.consigneeDetails?.address?.city}, {s.consigneeDetails?.address?.countryCode}
                          </div>
                        </td>
                        <td className="p-3 text-xs font-medium text-gray-700 dark:text-gray-300">
                          {s.carrier.replace('_', ' ')}
                        </td>
                        <td className="p-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                              s.incoterm === 'DDP'
                                ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                                : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                            }`}
                          >
                            {s.incoterm}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-xs text-gray-600 dark:text-gray-400">
                          {s.customsDeclaration?.csbNumber}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-xs text-gray-900 dark:text-white">
                          ₹{s.financials?.totalCharges?.toLocaleString('en-IN')}
                        </td>
                        <td className="p-3 text-center">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            {s.status}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => handleOpenCommercialInvoice(s._id)}
                            className="px-2.5 py-1 text-xs font-semibold rounded bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 hover:bg-blue-100 transition"
                          >
                            Commercial Invoice
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Commercial Invoice Modal */}
      {viewInvoiceModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-gray-800">
            {/* Header */}
            <div className="flex justify-between items-start border-b border-gray-100 dark:border-gray-800 pb-4">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600">
                  Indian Customs Commercial Export
                </span>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                  {viewInvoiceModal.title}
                </h3>
                <p className="text-xs text-gray-500 font-mono mt-0.5">
                  Invoice: {viewInvoiceModal.invoiceNumber} • CSB-V: {viewInvoiceModal.csbNumber}
                </p>
              </div>
              <button
                onClick={() => setViewInvoiceModal(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl font-bold"
              >
                ✕
              </button>
            </div>

            {/* Exporter & Consignee Grid */}
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 space-y-1">
                <div className="font-bold text-gray-800 dark:text-gray-200 uppercase">Exporter (Shipper):</div>
                <div className="font-semibold">{viewInvoiceModal.exporter.companyName}</div>
                <div>IEC: <span className="font-mono">{viewInvoiceModal.exporter.iec}</span></div>
                <div>AD Code: <span className="font-mono">{viewInvoiceModal.exporter.adCode}</span></div>
                <div>GSTIN: <span className="font-mono">{viewInvoiceModal.exporter.gstin}</span></div>
                <div>LUT: <span className="font-mono">{viewInvoiceModal.exporter.lutNumber}</span></div>
                <div className="text-gray-500">{viewInvoiceModal.exporter.address.city}, India</div>
              </div>

              <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 space-y-1">
                <div className="font-bold text-gray-800 dark:text-gray-200 uppercase">Consignee (Buyer):</div>
                <div className="font-semibold">{viewInvoiceModal.consignee.fullName}</div>
                {viewInvoiceModal.consignee.companyName && <div>{viewInvoiceModal.consignee.companyName}</div>}
                <div>Tax ID: <span className="font-mono">{viewInvoiceModal.consignee.taxId || 'N/A'}</span></div>
                <div className="text-gray-500">
                  {viewInvoiceModal.consignee.address.street}, {viewInvoiceModal.consignee.address.city}
                </div>
                <div>Country: <strong>{viewInvoiceModal.consignee.address.countryCode}</strong></div>
              </div>
            </div>

            {/* Items Table */}
            <div className="border border-gray-100 dark:border-gray-800 rounded-lg overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 dark:bg-gray-800/50 font-semibold text-gray-500 uppercase">
                  <tr>
                    <th className="p-2">Description</th>
                    <th className="p-2">ITC-HS</th>
                    <th className="p-2 text-center">COO</th>
                    <th className="p-2 text-right">Qty</th>
                    <th className="p-2 text-right">Unit ($)</th>
                    <th className="p-2 text-right">Total ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {viewInvoiceModal.items.map((item, idx) => (
                    <tr key={idx}>
                      <td className="p-2 font-medium">{item.description}</td>
                      <td className="p-2 font-mono text-gray-600 dark:text-gray-400">{item.hsCode}</td>
                      <td className="p-2 text-center font-bold text-gray-500">{item.countryOfOrigin}</td>
                      <td className="p-2 text-right font-semibold">{item.quantity}</td>
                      <td className="p-2 text-right">${item.unitPrice.toFixed(2)}</td>
                      <td className="p-2 text-right font-bold">${item.totalValue.toFixed(2)}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 dark:bg-gray-800/50 font-bold">
                    <td colSpan={3} className="p-2 text-right">Total Invoice Value:</td>
                    <td className="p-2 text-right">{viewInvoiceModal.totalQuantity}</td>
                    <td></td>
                    <td className="p-2 text-right text-sm text-blue-600 dark:text-blue-400">
                      ${viewInvoiceModal.totalInvoiceValue.toFixed(2)} {viewInvoiceModal.currency}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Declaration */}
            <div className="p-3 rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/50 text-[11px] text-gray-600 dark:text-gray-400 space-y-1">
              <div className="font-bold text-blue-900 dark:text-blue-300">Signed Customs Declaration:</div>
              <p>{viewInvoiceModal.declaration}</p>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setViewInvoiceModal(null)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 transition"
              >
                Close
              </button>
              <button
                onClick={() => alert(`Printing Official Commercial Invoice: ${viewInvoiceModal.invoiceNumber}`)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition shadow"
              >
                Print / Download PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
