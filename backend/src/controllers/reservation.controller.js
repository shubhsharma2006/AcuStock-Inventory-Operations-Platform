const reservationService = require('../services/reservation.service');
const { logBusinessEvent } = require('../utils/auditHelper');
const logger = require('../utils/logger');

class ReservationController {
  /**
   * POST /api/v1/reservations
   * Create a new stock reservation / hold
   */
  async createReservation(req, res) {
    try {
      const {
        productId,
        warehouseId,
        reservedQty,
        orderId,
        orderLineId,
        ttlMinutes,
        notes
      } = req.body;

      if (!productId) {
        return res.status(400).json({ success: false, error: 'productId is required' });
      }

      if (!reservedQty || parseInt(reservedQty, 10) <= 0) {
        return res.status(400).json({ success: false, error: 'reservedQty must be greater than 0' });
      }

      const reservation = await reservationService.reserveStock({
        tenantId: req.tenantId,
        productId,
        warehouseId,
        reservedQty,
        orderId,
        orderLineId,
        ttlMinutes: ttlMinutes || 60,
        notes,
        user: req.user
      });

      logBusinessEvent({
        req,
        action: 'STOCK_RESERVED',
        entityType: 'StockReservation',
        entityId: reservation._id,
        changes: {
          after: {
            reservationCode: reservation.reservationCode,
            productId: reservation.productId,
            reservedQty: reservation.reservedQty,
            expiresAt: reservation.expiresAt
          },
          summary: `Reserved ${reservation.reservedQty} units for product ${reservation.productId} (${reservation.reservationCode})`
        }
      }).catch(() => {});

      return res.status(201).json({
        success: true,
        message: 'Stock reserved successfully',
        reservation
      });
    } catch (error) {
      logger.error('Error creating stock reservation:', error);
      return res.status(error.status || 500).json({
        success: false,
        error: error.message || 'Internal server error',
        code: error.code || 'RESERVATION_ERROR',
        details: error.details || null
      });
    }
  }

  /**
   * GET /api/v1/reservations
   * List reservations with filtering
   */
  async listReservations(req, res) {
    try {
      const {
        productId,
        warehouseId,
        orderId,
        status,
        page = 1,
        limit = 50
      } = req.query;

      const result = await reservationService.listReservations({
        tenantId: req.tenantId,
        productId,
        warehouseId,
        orderId,
        status,
        page,
        limit
      });

      return res.json({
        success: true,
        ...result
      });
    } catch (error) {
      logger.error('Error listing reservations:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  /**
   * POST /api/v1/reservations/:id/release
   * Release an active reservation
   */
  async releaseReservation(req, res) {
    try {
      const { id } = req.params;
      const { reason = 'Manual release' } = req.body;

      const reservation = await reservationService.releaseReservation(id, {
        tenantId: req.tenantId,
        reason,
        user: req.user
      });

      logBusinessEvent({
        req,
        action: 'STOCK_RESERVATION_RELEASED',
        entityType: 'StockReservation',
        entityId: reservation._id,
        changes: {
          summary: `Released reservation ${reservation.reservationCode} (${reason})`
        }
      }).catch(() => {});

      return res.json({
        success: true,
        message: 'Reservation released successfully',
        reservation
      });
    } catch (error) {
      logger.error('Error releasing reservation:', error);
      return res.status(error.status || 500).json({
        success: false,
        error: error.message || 'Internal server error'
      });
    }
  }

  /**
   * GET /api/v1/reservations/product/:productId/summary
   * Get physical stock, reserved stock, and available-to-promise
   */
  async getProductStockSummary(req, res) {
    try {
      const { productId } = req.params;
      const { warehouseId } = req.query;

      const summary = await reservationService.getProductStockSummary(
        productId,
        req.tenantId,
        warehouseId
      );

      return res.json({
        success: true,
        summary
      });
    } catch (error) {
      logger.error('Error getting product stock summary:', error);
      return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
    }
  }

  /**
   * POST /api/v1/reservations/cleanup
   * Manually trigger expiry of overdue reservations
   */
  async cleanupExpired(req, res) {
    try {
      const result = await reservationService.cleanupExpiredReservations({
        tenantId: req.tenantId
      });

      return res.json({
        success: true,
        message: `Expired ${result.expiredCount} overdue reservations`,
        ...result
      });
    } catch (error) {
      logger.error('Error cleaning up reservations:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}

module.exports = new ReservationController();
