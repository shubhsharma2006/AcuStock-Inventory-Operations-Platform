'use strict';

const VolumetricEngine = require('./VolumetricEngine');
const BigshipProvider = require('./BigshipProvider');
const ShiprocketProvider = require('./ShiprocketProvider');
const logger = require('../../utils/logger');

/**
 * Smart Carrier Allocation Engine
 * Queries registered providers in parallel, normalizes quotes, and applies intelligent selection rules.
 */
class CarrierAllocationEngine {
  constructor() {
    this.providers = new Map();
    // Register standard aggregators
    this.registerProvider(new BigshipProvider());
    this.registerProvider(new ShiprocketProvider());
  }

  registerProvider(provider) {
    this.providers.set(provider.name, provider);
  }

  getProvider(name) {
    return this.providers.get(name) || null;
  }

  /**
   * Compare rates across all active providers and rank them according to policy.
   *
   * @param {Object} params
   * @param {'CHEAPEST'|'FASTEST'|'BEST_RATED'|'BALANCED'} [policy='BALANCED']
   * @returns {Promise<{
   *   quotes: Array<Object>,
   *   recommended: Object|null,
   *   weightSummary: Object,
   *   totalCarriersEvaluated: number
   * }>}
   */
  async compareAndRank(params, policy = 'BALANCED') {
    const weightSummary = VolumetricEngine.calculateWeight(params);

    // Fetch quotes across all registered providers concurrently
    const providerTasks = Array.from(this.providers.values()).map(provider =>
      provider.getRates(params).catch(err => {
        logger.warn(`Provider ${provider.name} failed rate calculation:`, err.message);
        return [];
      })
    );

    const results = await Promise.all(providerTasks);
    let allQuotes = results.flat().filter(q => q && q.isServiceable);

    if (allQuotes.length === 0) {
      return {
        quotes: [],
        recommended: null,
        weightSummary,
        totalCarriersEvaluated: 0
      };
    }

    // Apply Smart Allocation Ranking Policy
    const rankedQuotes = [...allQuotes].sort((a, b) => {
      if (policy === 'CHEAPEST') {
        return a.rate - b.rate;
      }
      if (policy === 'FASTEST') {
        if (a.expectedDays !== b.expectedDays) {
          return a.expectedDays - b.expectedDays;
        }
        return a.rate - b.rate;
      }
      if (policy === 'BEST_RATED') {
        if (a.carrierScore !== b.carrierScore) {
          return b.carrierScore - a.carrierScore; // Higher score first
        }
        return a.rate - b.rate;
      }
      // BALANCED (Default): Balances rate, speed, and carrier reliability
      // Score = (100 - (rate / 10)) + (carrierScore * 0.5) - (expectedDays * 5)
      const scoreA = (100 - (a.rate / 10)) + (a.carrierScore * 0.5) - (a.expectedDays * 5);
      const scoreB = (100 - (b.rate / 10)) + (b.carrierScore * 0.5) - (b.expectedDays * 5);
      return scoreB - scoreA;
    });

    // Mark the recommended top choice
    const recommended = rankedQuotes[0] ? { ...rankedQuotes[0], isRecommended: true } : null;
    const finalQuotes = rankedQuotes.map((q, idx) => ({
      ...q,
      isRecommended: idx === 0,
      rank: idx + 1
    }));

    return {
      policy,
      weightSummary,
      quotes: finalQuotes,
      recommended,
      totalCarriersEvaluated: finalQuotes.length
    };
  }
}

// Export singleton instance
module.exports = new CarrierAllocationEngine();
