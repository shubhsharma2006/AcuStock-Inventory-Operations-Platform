/**
 * PlanCatalog — Server-authoritative single source of truth for subscription plans.
 * Prices are configured in standard units and minor units (paise for INR, cents for USD)
 * to avoid floating point ambiguity.
 */

const PLANS = {
  free: {
    id: 'free',
    name: 'Free Tier',
    description: 'Essential inventory features for individuals and small operations.',
    price: {
      INR: 0,
      USD: 0,
    },
    priceMinor: {
      INR: 0,
      USD: 0,
    },
    limits: {
      maxUsers: 5,
      maxItems: 100,
      maxStorage: 256, // MB
      maxAiQueries: 50,
      maxOcrScans: 10,
    },
    features: [
      'Up to 5 team members',
      '100 active catalog SKUs',
      'Basic Stock IN & Stock OUT',
      'AcuBot AI Copilot (50 queries/mo)',
      'AI Invoice OCR (10 scans/mo)',
      'Community support'
    ]
  },
  starter: {
    id: 'starter',
    name: 'Starter Plan',
    description: 'Designed for expanding warehouses and growing business operations.',
    price: {
      INR: 999,
      USD: 29,
    },
    priceMinor: {
      INR: 99900, // 999 INR = 99,900 paise
      USD: 2900,  // 29 USD = 2,900 cents
    },
    limits: {
      maxUsers: 15,
      maxItems: 1000,
      maxStorage: 2048, // 2GB
      maxAiQueries: 500,
      maxOcrScans: 100,
    },
    features: [
      'Up to 15 team members',
      '1,000 active catalog SKUs',
      'Strict serial tracking policy',
      'Purchase & Sales Orders with PDF',
      'AcuBot AI Copilot (500 queries/mo)',
      'AI Invoice OCR (100 scans/mo)',
      'Multi-warehouse stock transfers'
    ]
  },
  professional: {
    id: 'professional',
    name: 'Professional Plan',
    description: 'Enterprise scale throughput with complete compliance and governance.',
    price: {
      INR: 2499,
      USD: 79,
    },
    priceMinor: {
      INR: 249900, // 2,499 INR = 249,900 paise
      USD: 7900,   // 79 USD = 7,900 cents
    },
    limits: {
      maxUsers: 50,
      maxItems: 10000,
      maxStorage: 10240, // 10GB
      maxAiQueries: 5000,
      maxOcrScans: 1000,
    },
    features: [
      'Up to 50 team members',
      '10,000 active catalog SKUs',
      'AcuBot AI Copilot (5,000 queries/mo)',
      'AI WhatsApp 24/7 Operations Assistant',
      'AI Invoice & Packing Slip OCR (1,000 scans/mo)',
      'Full compliance audit ledger',
      'Scheduled automated reports'
    ]
  }
};

function getPlan(planId) {
  if (!planId) return null;
  return PLANS[planId.toLowerCase()] || null;
}

function getAllPlans() {
  return Object.values(PLANS);
}

function getPlanPrice(planId, currency = 'INR') {
  const plan = getPlan(planId);
  if (!plan) return null;
  const curr = currency.toUpperCase();
  return {
    amount: plan.price[curr] ?? plan.price.USD,
    amountMinor: plan.priceMinor[curr] ?? plan.priceMinor.USD,
    currency: curr
  };
}

module.exports = {
  PLANS,
  getPlan,
  getAllPlans,
  getPlanPrice
};
