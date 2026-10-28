const express = require('express');
const router = express.Router();
const reservationController = require('../controllers/reservation.controller');
const { requireTenantId, requireRole } = require('../middleware/auth');
const { requireApiKeyOrAuth, requireScope } = require('../middleware/apiKeyAuth');

// All reservation routes accept either user JWT or developer API Key
router.use(requireApiKeyOrAuth);
router.use(requireTenantId);

// List reservations
router.get('/', requireScope('read:reservations'), (req, res) =>
  reservationController.listReservations(req, res)
);

// Get product stock & reservation summary
router.get('/product/:productId/summary', requireScope('read:reservations'), (req, res) =>
  reservationController.getProductStockSummary(req, res)
);

// Create reservation / hold
router.post('/', requireRole(['ADMIN', 'MANAGER']), requireScope('write:reservations'), (req, res) =>
  reservationController.createReservation(req, res)
);

// Release an active reservation
router.post('/:id/release', requireRole(['ADMIN', 'MANAGER']), requireScope('write:reservations'), (req, res) =>
  reservationController.releaseReservation(req, res)
);

// Cleanup expired reservations
router.post('/cleanup', requireRole(['ADMIN', 'SUPER_ADMIN']), (req, res) =>
  reservationController.cleanupExpired(req, res)
);

module.exports = router;
