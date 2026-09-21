/**
 * Cursor-Based Pagination Utility (O(1) Scalability for Large Datasets)
 * ─────────────────────────────────────────────────────────────
 * Replaces slow offset pagination (skip/limit) with cursor-based pagination
 * for tables exceeding 100,000+ entries (StockLedger, Items, AuditLogs).
 * 
 * Performance:
 *   - Offset (skip): O(N) - scours previous N items in index.
 *   - Cursor (_id):  O(1) - indexed B-tree point lookup.
 */

async function paginateWithCursor(model, queryFilter = {}, options = {}) {
  const limit = Math.min(Math.max(parseInt(options.limit || '20', 10), 1), 100);
  const cursor = options.cursor;
  const sortDirection = options.sort === 'asc' ? 1 : -1;
  const sortField = options.sortField || '_id';

  const filter = { ...queryFilter };

  if (cursor) {
    if (sortDirection === -1) {
      filter._id = { $lt: cursor };
    } else {
      filter._id = { $gt: cursor };
    }
  }

  const items = await model
    .find(filter)
    .sort({ [sortField]: sortDirection })
    .limit(limit + 1)
    .populate(options.populate || '')
    .lean();

  const hasNextPage = items.length > limit;
  if (hasNextPage) {
    items.pop(); // Remove extra peek item
  }

  const nextCursor = hasNextPage && items.length > 0 ? items[items.length - 1]._id : null;

  return {
    items,
    pagination: {
      limit,
      hasNextPage,
      nextCursor,
      count: items.length,
    },
  };
}

module.exports = {
  paginateWithCursor,
};
