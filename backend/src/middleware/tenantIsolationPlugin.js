/**
 * Tenant Isolation Mongoose Plugin
 * ─────────────────────────────────────────────────────────────
 * Enforces multi-tenant isolation at the database driver layer.
 * Applied ONLY to schemas classified as TENANT_SCOPED.
 *
 * Prevents accidental cross-tenant data leakage by ensuring every
 * read, write, count, and aggregation includes a tenant filter.
 *
 * For system-level operations (e.g. migrations, global crons),
 * pass `{ skipTenantIsolation: true }` in query options or pipeline options.
 */

const logger = require('../utils/logger');

module.exports = function tenantIsolationPlugin(schema, options = {}) {
  // Add tenantId field if not already present on the schema
  if (!schema.path('tenantId')) {
    const mongoose = require('mongoose');
    schema.add({
      tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tenant',
        index: true,
      },
    });
  }

  // List of query hooks to intercept
  const queryMethods = [
    'count',
    'countDocuments',
    'estimatedDocumentCount',
    'find',
    'findOne',
    'findOneAndDelete',
    'findOneAndRemove',
    'findOneAndReplace',
    'findOneAndUpdate',
    'replaceOne',
    'update',
    'updateOne',
    'updateMany',
    'deleteOne',
    'deleteMany',
  ];

  // ── 1. Query Hooks ──────────────────────────────────────────
  queryMethods.forEach((method) => {
    schema.pre(method, function () {
      const queryOptions = this.getOptions() || {};

      // Allow explicit system bypass
      if (queryOptions.skipTenantIsolation === true) {
        return;
      }

      const currentQuery = this.getQuery() || {};

      // If tenantId was supplied via query options (e.g. Model.find().setOptions({ tenantId }))
      if (queryOptions.tenantId && !currentQuery.tenantId) {
        this.where({ tenantId: queryOptions.tenantId });
        return;
      }

      // If tenantId is already in the query conditions, we're good
      if (currentQuery.tenantId !== undefined) {
        return;
      }

      // Production must fail closed unless an explicit opt-out is provided.
      const strictTenantEnforcement = process.env.STRICT_TENANT_ENFORCEMENT === 'true' ||
        (process.env.NODE_ENV === 'production' && process.env.STRICT_TENANT_ENFORCEMENT !== 'false');
      if (strictTenantEnforcement) {
        const modelName = this.model?.modelName || 'UnknownModel';
        const err = new Error(`[TenantIsolation] Fail-Closed: Query on ${modelName} executed without tenantId scope`);
        logger.error(err.message, { query: currentQuery });
        throw err;
      }
    });
  });

  // ── 2. Aggregation Hook ─────────────────────────────────────
  schema.pre('aggregate', function () {
    const aggOptions = this.options || {};

    if (aggOptions.skipTenantIsolation === true) {
      return;
    }

    const pipeline = this.pipeline();
    if (!pipeline || !pipeline.length) {
      return;
    }

    const firstStage = pipeline[0];
    const hasTenantInFirstMatch =
      firstStage &&
      firstStage.$match &&
      (firstStage.$match.tenantId !== undefined ||
        firstStage.$match['$and']?.some((c) => c.tenantId !== undefined));

    if (aggOptions.tenantId && !hasTenantInFirstMatch) {
      pipeline.unshift({ $match: { tenantId: aggOptions.tenantId } });
      return;
    }

    const strictTenantEnforcement = process.env.STRICT_TENANT_ENFORCEMENT === 'true' ||
      (process.env.NODE_ENV === 'production' && process.env.STRICT_TENANT_ENFORCEMENT !== 'false');
    if (!hasTenantInFirstMatch && strictTenantEnforcement) {
      const modelName = this._model?.modelName || 'UnknownModel';
      const err = new Error(`[TenantIsolation] Fail-Closed: Aggregation on ${modelName} missing tenantId in first stage`);
      logger.error(err.message);
      throw err;
    }
  });
};
