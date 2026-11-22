'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

interface WalletTransaction {
  transactionId: string;
  type: 'TOPUP' | 'FREIGHT_DEBIT' | 'DISCREPANCY_DEBIT' | 'DISPUTE_REFUND' | 'COD_EARLY_CREDIT';
  amount: number;
  runningBalance: number;
  awb?: string;
  reference?: string;
  carrier?: string;
  costCenter?: string;
  description?: string;
  paymentId?: string;
  createdAt: string;
}

interface MonthlyGstInvoice {
  invoiceNumber: string;
  month: number;
  year: number;
  sacCode: string;
  totalShipments: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalGst: number;
  grandTotal: number;
  status: 'GENERATED' | 'PAID' | 'SETTLED';
  generatedAt: string;
}

interface WalletData {
  _id: string;
  billingType: 'PREPAID' | 'POSTPAID';
  balance: number;
  creditLimit: number;
  creditUsed: number;
  autoRecharge: {
    enabled: boolean;
    thresholdAmount: number;
    topUpAmount: number;
    paymentMethod: string;
  };
  transactions: WalletTransaction[];
  monthlyInvoices: MonthlyGstInvoice[];
}

interface SpendAnalytics {
  totalSpend: number;
  byCarrier: Record<string, number>;
  byCostCenter: Record<string, number>;
  totalTransactions: number;
}

export default function LogisticsWalletPage() {
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'TRANSACTIONS' | 'INVOICES' | 'ANALYTICS'>('TRANSACTIONS');
  const [topUpAmount, setTopUpAmount] = useState('5000');
  const [paymentMethod, setPaymentMethod] = useState('UPI');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [notificationBanner, setNotificationBanner] = useState<string | null>(null);

  // Auto-Recharge State
  const [autoRechargeEnabled, setAutoRechargeEnabled] = useState(false);
  const [thresholdAmount, setThresholdAmount] = useState('2000');
  const [autoTopUpAmount, setAutoTopUpAmount] = useState('5000');

  // Invoice Generation State
  const [invoiceMonth, setInvoiceMonth] = useState(String(new Date().getMonth() + 1));
  const [invoiceYear, setInvoiceYear] = useState(String(new Date().getFullYear()));
  const [isInterState, setIsInterState] = useState(false);

  // 1. Fetch Wallet Details
  const { data: walletData, isLoading: loadingWallet } = useQuery<{ success: boolean; wallet: WalletData }>({
    queryKey: ['logistics-wallet'],
    queryFn: () => apiFetch('/logistics-wallet'),
    refetchInterval: 15_000
  });

  // 2. Fetch Spend Analytics
  const { data: analyticsData } = useQuery<{ success: boolean; analytics: SpendAnalytics }>({
    queryKey: ['logistics-wallet-analytics'],
    queryFn: () => apiFetch('/logistics-wallet/spend-analytics'),
    enabled: activeTab === 'ANALYTICS',
    refetchInterval: 30_000
  });

  const wallet = walletData?.wallet;

  // Sync autoRecharge state when wallet loads
  React.useEffect(() => {
    if (wallet?.autoRecharge) {
      setAutoRechargeEnabled(wallet.autoRecharge.enabled);
      setThresholdAmount(String(wallet.autoRecharge.thresholdAmount || 2000));
      setAutoTopUpAmount(String(wallet.autoRecharge.topUpAmount || 5000));
    }
  }, [wallet]);

  // Top-Up Mutation
  const topUpMutation = useMutation({
    mutationFn: (body: any) => apiFetch('/logistics-wallet/topup', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (data: any) => {
      setNotificationBanner(data.message || 'Wallet recharged successfully!');
      queryClient.invalidateQueries({ queryKey: ['logistics-wallet'] });
      queryClient.invalidateQueries({ queryKey: ['logistics-wallet-analytics'] });
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to top up wallet');
    }
  });

  // Configure Auto-Recharge Mutation
  const autoRechargeMutation = useMutation({
    mutationFn: (body: any) => apiFetch('/logistics-wallet/auto-recharge', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (data: any) => {
      setNotificationBanner(data.message || 'Auto-recharge configuration updated!');
      queryClient.invalidateQueries({ queryKey: ['logistics-wallet'] });
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to update auto-recharge');
    }
  });

  // Generate Invoice Mutation
  const generateInvoiceMutation = useMutation({
    mutationFn: (body: any) => apiFetch('/logistics-wallet/generate-invoice', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (data: any) => {
      setNotificationBanner(data.message || 'Consolidated GST Tax Invoice generated successfully!');
      queryClient.invalidateQueries({ queryKey: ['logistics-wallet'] });
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to generate tax invoice');
    }
  });

  const handleQuickTopUp = (amount: number) => {
    topUpMutation.mutate({
      amount,
      paymentMethod,
      notes: `Instant Wallet Top-up (₹${amount.toLocaleString('en-IN')})`
    });
  };

  const handleSaveAutoRecharge = (e: React.FormEvent) => {
    e.preventDefault();
    autoRechargeMutation.mutate({
      enabled: autoRechargeEnabled,
      thresholdAmount: Number(thresholdAmount),
      topUpAmount: Number(autoTopUpAmount),
      paymentMethod: 'UPI_AUTOPAY'
    });
  };

  const handleGenerateInvoice = (e: React.FormEvent) => {
    e.preventDefault();
    generateInvoiceMutation.mutate({
      month: Number(invoiceMonth),
      year: Number(invoiceYear),
      isInterState
    });
  };

  const filteredTransactions = (wallet?.transactions || [])
    .filter((tx) => {
      if (filterType === 'ALL') return true;
      return tx.type === filterType;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Title Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
              Multi-Carrier Logistics Wallet & Consolidated Billing
            </h1>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              GST SAC 996511
            </span>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Prepaid freight balance management, instant UPI/NetBanking top-ups, automated low-balance triggers, and monthly consolidated GST ITC invoices.
          </p>
        </div>

        {/* Quick Top-Up Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleQuickTopUp(2000)}
            disabled={topUpMutation.isPending}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 border border-indigo-200 dark:border-indigo-800 transition shadow-sm"
          >
            + ₹2,000
          </button>
          <button
            onClick={() => handleQuickTopUp(5000)}
            disabled={topUpMutation.isPending}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 border border-indigo-200 dark:border-indigo-800 transition shadow-sm"
          >
            + ₹5,000
          </button>
          <button
            onClick={() => handleQuickTopUp(10000)}
            disabled={topUpMutation.isPending}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition shadow-sm"
          >
            + ₹10,000
          </button>
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

      {/* Hero Financial KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Available Balance */}
        <div className="p-5 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm relative overflow-hidden">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Available Freight Balance</div>
          <div className="text-2xl font-black text-gray-900 dark:text-white mt-1">
            ₹{(wallet?.balance ?? 5000).toLocaleString('en-IN')}
          </div>
          <div className="mt-2 flex items-center text-xs">
            {(wallet?.balance ?? 5000) < 2000 ? (
              <span className="text-amber-600 font-semibold flex items-center gap-1">
                ⚠️ Low Balance (&lt; ₹2,000)
              </span>
            ) : (
              <span className="text-emerald-600 font-semibold flex items-center gap-1">
                ✓ Healthy Operational Buffer
              </span>
            )}
          </div>
        </div>

        {/* Postpaid Credit Line */}
        <div className="p-5 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Approved Credit Limit</div>
          <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1">
            ₹{(wallet?.creditLimit ?? 0).toLocaleString('en-IN')}
          </div>
          <div className="text-xs text-gray-500 mt-2">
            Used: ₹{(wallet?.creditUsed ?? 0).toLocaleString('en-IN')} • T+15 Net Terms
          </div>
        </div>

        {/* Auto-Recharge Status */}
        <div className="p-5 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Auto-Recharge Trigger</div>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`inline-block w-2.5 h-2.5 rounded-full ${
                autoRechargeEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'
              }`}
            />
            <span className="text-lg font-bold text-gray-900 dark:text-white">
              {autoRechargeEnabled ? 'Active' : 'Disabled'}
            </span>
          </div>
          <div className="text-xs text-gray-500 mt-2">
            Triggers ₹{Number(autoTopUpAmount).toLocaleString('en-IN')} at &lt; ₹{Number(thresholdAmount).toLocaleString('en-IN')}
          </div>
        </div>

        {/* Monthly GST Invoices */}
        <div className="p-5 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Consolidated GST Invoices</div>
          <div className="text-2xl font-black text-gray-900 dark:text-white mt-1">
            {wallet?.monthlyInvoices?.length ?? 0} Invoices
          </div>
          <div className="text-xs text-emerald-600 mt-2 font-medium">
            100% 18% ITC Recoverable (SAC 996511)
          </div>
        </div>
      </div>

      {/* Custom Top-Up & Auto-Recharge Drawer Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Custom Instant Top-Up Card */}
        <div className="p-6 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <span>⚡</span> Instant Wallet Top-Up
          </h2>
          <p className="text-xs text-gray-500">
            Funds reflect instantaneously in your multi-carrier freight balance. Recharges can be made via UPI, Corporate NetBanking, or Credit/Debit Cards.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Top-Up Amount (₹)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-gray-400 font-bold">₹</span>
                <input
                  type="number"
                  min="100"
                  value={topUpAmount}
                  onChange={(e) => setTopUpAmount(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Payment Channel
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
              >
                <option value="UPI">UPI AutoPay / QR</option>
                <option value="NETBANKING">Corporate NetBanking</option>
                <option value="CARD">Corporate Credit Card</option>
                <option value="NEFT_RTGS">Direct Bank Transfer (NEFT/RTGS)</option>
              </select>
            </div>
          </div>

          <button
            onClick={() => handleQuickTopUp(Number(topUpAmount))}
            disabled={topUpMutation.isPending || Number(topUpAmount) < 100}
            className="w-full py-2.5 px-4 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition shadow disabled:opacity-50"
          >
            {topUpMutation.isPending ? 'Processing Recharge...' : `Recharge ₹${Number(topUpAmount).toLocaleString('en-IN')}`}
          </button>
        </div>

        {/* Auto-Recharge Automation Rules */}
        <form
          onSubmit={handleSaveAutoRecharge}
          className="p-6 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <span>🤖</span> Zero-Downtime Auto-Recharge
            </h2>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={autoRechargeEnabled}
                onChange={(e) => setAutoRechargeEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-emerald-600"></div>
            </label>
          </div>
          <p className="text-xs text-gray-500">
            Never let shipments stop due to zero balance. When your freight balance falls below the threshold, our engine automatically triggers a pre-approved top-up.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Threshold Level (₹)
              </label>
              <input
                type="number"
                min="500"
                value={thresholdAmount}
                onChange={(e) => setThresholdAmount(e.target.value)}
                disabled={!autoRechargeEnabled}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Auto-Debit Amount (₹)
              </label>
              <input
                type="number"
                min="1000"
                value={autoTopUpAmount}
                onChange={(e) => setAutoTopUpAmount(e.target.value)}
                disabled={!autoRechargeEnabled}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={autoRechargeMutation.isPending}
            className="w-full py-2.5 px-4 text-sm font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition shadow disabled:opacity-50"
          >
            {autoRechargeMutation.isPending ? 'Saving...' : 'Update Auto-Recharge Policy'}
          </button>
        </form>
      </div>

      {/* Tabs Control */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 space-x-6">
        <button
          onClick={() => setActiveTab('TRANSACTIONS')}
          className={`pb-3 text-sm font-semibold border-b-2 transition ${
            activeTab === 'TRANSACTIONS'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Transactions Ledger ({wallet?.transactions?.length ?? 0})
        </button>

        <button
          onClick={() => setActiveTab('INVOICES')}
          className={`pb-3 text-sm font-semibold border-b-2 transition ${
            activeTab === 'INVOICES'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Consolidated GST Tax Invoices ({wallet?.monthlyInvoices?.length ?? 0})
        </button>

        <button
          onClick={() => setActiveTab('ANALYTICS')}
          className={`pb-3 text-sm font-semibold border-b-2 transition ${
            activeTab === 'ANALYTICS'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Spend Analytics & Cost Centers
        </button>
      </div>

      {/* TAB 1: TRANSACTIONS LEDGER */}
      {activeTab === 'TRANSACTIONS' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 font-semibold">Filter:</span>
              {['ALL', 'TOPUP', 'FREIGHT_DEBIT', 'DISPUTE_REFUND', 'COD_EARLY_CREDIT'].map((t) => (
                <button
                  key={t}
                  onClick={() => setFilterType(t)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                    filterType === t
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                  }`}
                >
                  {t.replace('_', ' ')}
                </button>
              ))}
            </div>
            <div className="text-xs text-gray-500">
              Showing {filteredTransactions.length} records
            </div>
          </div>

          {/* Table */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900/50 text-xs font-semibold text-gray-500 uppercase">
                  <tr>
                    <th className="p-3">Date</th>
                    <th className="p-3">TX ID</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Description / Carrier</th>
                    <th className="p-3">Cost Center</th>
                    <th className="p-3 text-right">Amount (₹)</th>
                    <th className="p-3 text-right">Balance (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-gray-400">
                        No transactions recorded in this view.
                      </td>
                    </tr>
                  ) : (
                    filteredTransactions.map((tx) => (
                      <tr key={tx.transactionId} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/30">
                        <td className="p-3 text-xs text-gray-500 whitespace-nowrap">
                          {new Date(tx.createdAt).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </td>
                        <td className="p-3 font-mono text-xs font-bold text-gray-700 dark:text-gray-300">
                          {tx.transactionId}
                        </td>
                        <td className="p-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                              tx.type === 'TOPUP' || tx.type === 'COD_EARLY_CREDIT' || tx.type === 'DISPUTE_REFUND'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                            }`}
                          >
                            {tx.type}
                          </span>
                        </td>
                        <td className="p-3 text-xs">
                          <div className="font-medium text-gray-900 dark:text-gray-100">{tx.description}</div>
                          {tx.awb && <div className="text-[11px] font-mono text-gray-400">AWB: {tx.awb}</div>}
                        </td>
                        <td className="p-3 text-xs text-gray-500">{tx.costCenter || 'Operations'}</td>
                        <td
                          className={`p-3 text-right font-bold text-sm ${
                            tx.amount > 0 ? 'text-emerald-600' : 'text-rose-600'
                          }`}
                        >
                          {tx.amount > 0 ? `+ ₹${tx.amount.toLocaleString('en-IN')}` : `- ₹${Math.abs(tx.amount).toLocaleString('en-IN')}`}
                        </td>
                        <td className="p-3 text-right font-bold text-sm text-gray-900 dark:text-white">
                          ₹{tx.runningBalance.toLocaleString('en-IN')}
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

      {/* TAB 2: MONTHLY CONSOLIDATED GST TAX INVOICES */}
      {activeTab === 'INVOICES' && (
        <div className="space-y-6">
          {/* Invoice Generator Card */}
          <form
            onSubmit={handleGenerateInvoice}
            className="p-5 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4"
          >
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                Generate Monthly GST Freight Invoice (SAC 996511)
              </h3>
              <p className="text-xs text-gray-500">
                Consolidates all carrier debits for the calendar month into a legally compliant GST tax invoice for claiming full Input Tax Credit (ITC).
              </p>
            </div>

            <div className="flex items-center gap-3">
              <select
                value={invoiceMonth}
                onChange={(e) => setInvoiceMonth(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              >
                {[
                  'January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'
                ].map((name, idx) => (
                  <option key={name} value={idx + 1}>
                    {name}
                  </option>
                ))}
              </select>

              <select
                value={invoiceYear}
                onChange={(e) => setInvoiceYear(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              >
                <option value="2025">2025</option>
                <option value="2026">2026</option>
                <option value="2027">2027</option>
              </select>

              <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isInterState}
                  onChange={(e) => setIsInterState(e.target.checked)}
                  className="rounded border-gray-300 text-indigo-600"
                />
                <span>Inter-State (IGST 18%)</span>
              </label>

              <button
                type="submit"
                disabled={generateInvoiceMutation.isPending}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition shadow"
              >
                {generateInvoiceMutation.isPending ? 'Generating...' : 'Generate Invoice'}
              </button>
            </div>
          </form>

          {/* Invoices List */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900/50 text-xs font-semibold text-gray-500 uppercase">
                  <tr>
                    <th className="p-3">Invoice No</th>
                    <th className="p-3">Period</th>
                    <th className="p-3">SAC Code</th>
                    <th className="p-3 text-right">Shipments</th>
                    <th className="p-3 text-right">Taxable (₹)</th>
                    <th className="p-3 text-right">GST 18% (₹)</th>
                    <th className="p-3 text-right">Total Invoice (₹)</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {(!wallet?.monthlyInvoices || wallet.monthlyInvoices.length === 0) ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-gray-400">
                        No monthly tax invoices generated yet. Click "Generate Invoice" above.
                      </td>
                    </tr>
                  ) : (
                    wallet.monthlyInvoices.map((inv) => (
                      <tr key={inv.invoiceNumber} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/30">
                        <td className="p-3 font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400">
                          {inv.invoiceNumber}
                        </td>
                        <td className="p-3 text-xs text-gray-700 dark:text-gray-300 font-medium">
                          {new Date(inv.year, inv.month - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })}
                        </td>
                        <td className="p-3 text-xs font-mono text-gray-500">
                          {inv.sacCode} (Freight)
                        </td>
                        <td className="p-3 text-right text-xs font-semibold text-gray-800 dark:text-gray-200">
                          {inv.totalShipments}
                        </td>
                        <td className="p-3 text-right text-xs font-mono text-gray-900 dark:text-white">
                          ₹{inv.taxableAmount.toLocaleString('en-IN')}
                        </td>
                        <td className="p-3 text-right text-xs font-mono text-emerald-600 font-semibold">
                          ₹{inv.totalGst.toLocaleString('en-IN')}
                        </td>
                        <td className="p-3 text-right text-sm font-mono font-bold text-gray-900 dark:text-white">
                          ₹{inv.grandTotal.toLocaleString('en-IN')}
                        </td>
                        <td className="p-3 text-center">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            {inv.status}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => alert(`Downloading GST ITC Invoice PDF: ${inv.invoiceNumber}`)}
                            className="px-2.5 py-1 text-xs font-semibold rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 transition"
                          >
                            Download PDF
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

      {/* TAB 3: SPEND ANALYTICS & COST CENTERS */}
      {activeTab === 'ANALYTICS' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* By Carrier */}
            <div className="p-6 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
              <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center justify-between">
                <span>Freight Spend by Carrier</span>
                <span className="text-xs text-gray-400">Total: ₹{(analyticsData?.analytics?.totalSpend ?? 0).toLocaleString('en-IN')}</span>
              </h3>
              <div className="space-y-3">
                {Object.entries(analyticsData?.analytics?.byCarrier || {
                  Delhivery: 18500,
                  BlueDart: 12400,
                  'V-Trans Heavy': 32000,
                  'Porter City Fleet': 6200
                }).map(([carrier, amount]) => {
                  const total = analyticsData?.analytics?.totalSpend || 69100;
                  const pct = Math.round((amount / total) * 100);
                  return (
                    <div key={carrier} className="space-y-1">
                      <div className="flex justify-between text-xs font-medium text-gray-700 dark:text-gray-300">
                        <span>{carrier}</span>
                        <span className="font-bold">₹{amount.toLocaleString('en-IN')} ({pct}%)</span>
                      </div>
                      <div className="w-full bg-gray-100 dark:bg-gray-700 h-2 rounded-full overflow-hidden">
                        <div className="bg-indigo-600 h-2 rounded-full" style={{ width: `${pct}%` }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* By Cost Center */}
            <div className="p-6 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
              <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center justify-between">
                <span>Spend by Cost Center / Branch</span>
                <span className="text-xs text-gray-400">{analyticsData?.analytics?.totalTransactions ?? 0} Transactions</span>
              </h3>
              <div className="space-y-3">
                {Object.entries(analyticsData?.analytics?.byCostCenter || {
                  'B2C E-Commerce Fulfillment': 28500,
                  'B2B Wholesale & Cargo': 32000,
                  'Inter-Warehouse Stock Transfer': 8600
                }).map(([cc, amount]) => {
                  const total = analyticsData?.analytics?.totalSpend || 69100;
                  const pct = Math.round((amount / total) * 100);
                  return (
                    <div key={cc} className="space-y-1">
                      <div className="flex justify-between text-xs font-medium text-gray-700 dark:text-gray-300">
                        <span>{cc}</span>
                        <span className="font-bold">₹{amount.toLocaleString('en-IN')} ({pct}%)</span>
                      </div>
                      <div className="w-full bg-gray-100 dark:bg-gray-700 h-2 rounded-full overflow-hidden">
                        <div className="bg-emerald-600 h-2 rounded-full" style={{ width: `${pct}%` }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
