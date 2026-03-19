# Inventory Management System Fixes

## Issues Identified

### 1. Dual Stock Maintenance (Critical)
- **Problem**: Item.quantity is stored and updated, but reports calculate stock from StockLedger. This can lead to inconsistencies.
- **Fix**: Remove Item.quantity field and always calculate current stock from ledger entries.

### 2. Missing Active User Validation (Security)
- **Problem**: Auth middleware doesn't check if user.isActive is true.
- **Fix**: Add isActive check in auth middleware.

### 3. Race Conditions in Stock Updates (Critical)
- **Problem**: Concurrent OUT operations can lead to negative stock due to no transactions.
- **Fix**: Wrap stock operations in database transactions.

### 4. Incomplete Serial Validation
- **Problem**: For OUT, checks if serial was ever IN, but not if it's currently available (could be already OUT).
- **Fix**: Check the last audit entry for each serial to ensure it's IN.

### 5. No Duplicate Serial Check Within Entry
- **Problem**: No validation for duplicate serials in the same IN/OUT entry.
- **Fix**: Check for duplicates within the serialNumbers array.

### 6. Serial Policy Not Enforced
- **Problem**: Item.serialPolicy.inStock and outStock not validated in backend.
- **Fix**: Implement policy checks based on item settings.

### 7. Missing Validations
- **Problem**: No validation for batch numbers, expiry dates, unit prices, reference uniqueness.
- **Fix**: Add appropriate validations.

### 8. Unused Stock Model
- **Problem**: Stock.js model exists but no routes use it, causing confusion.
- **Fix**: Either implement routes or remove the model.

### 9. No Transaction Safety
- **Problem**: Stock updates not atomic.
- **Fix**: Use MongoDB transactions for multi-document operations.

### 10. Audit Trail Issues
- **Problem**: SerialAudit allows duplicate serials (unique index on serial only).
- **Fix**: Ensure audit entries are properly tracked.

## Implementation Plan

### Phase 1: Critical Fixes
1. [ ] Add active user check in auth middleware
2. [ ] Implement database transactions for stock operations
3. [ ] Fix serial validation for OUT operations
4. [ ] Add duplicate serial check within entries

### Phase 2: Data Consistency
5. [ ] Remove Item.quantity field and update all references to calculate from ledger
6. [ ] Update items.js to not return quantity
7. [ ] Update frontend to calculate stock from API

### Phase 3: Enhanced Validations
8. [ ] Implement serial policy enforcement
9. [ ] Add batch/expiry validations
10. [ ] Add unit price validations
11. [ ] Add reference uniqueness check

### Phase 4: Cleanup
12. [ ] Decide on Stock model (implement routes or remove)
13. [ ] Ensure all audit trails are immutable
14. [ ] Add comprehensive error handling

## Files to Modify
- backend/src/middleware/auth.js
- backend/src/routes/stock.js
- backend/src/models/Item.js
- backend/src/routes/items.js
- backend/src/routes/reports.js
- backend/src/models/SerialAudit.js
- frontend files (if needed for stock calculation)
