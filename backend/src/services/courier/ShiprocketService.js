/**
 * Shiprocket Courier Integration Service
 * 
 * Provides live automated courier booking, AWB generation, and shipping label
 * fetching via the official Shiprocket B2B API (v2).
 * 
 * Aggregates carriers: Delhivery, Blue Dart, DTDC, Shadowfax, Ecom Express.
 * Falls back to deterministic mock simulation if API credentials are not set.
 */

const logger = require('../../utils/logger');

class ShiprocketService {
  constructor() {
    this.email = process.env.SHIPROCKET_EMAIL;
    this.password = process.env.SHIPROCKET_PASSWORD;
    this.baseUrl = 'https://apiv2.shiprocket.in/v1/external';
    this.token = null;
    this.tokenExpiry = 0;
  }

  isConfigured() {
    return Boolean(this.email && this.password);
  }

  /**
   * Authenticate and obtain JWT token from Shiprocket
   */
  async getAuthToken() {
    if (!this.isConfigured()) return null;

    // Return cached token if valid for at least 5 more minutes
    if (this.token && Date.now() < this.tokenExpiry - 300000) {
      return this.token;
    }

    try {
      const res = await fetch(`${this.baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: this.email,
          password: this.password,
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        throw new Error(`Shiprocket auth failed with status ${res.status}`);
      }

      const data = await res.json();
      this.token = data.token;
      // Tokens are typically valid for 10 days; refresh after 7 days
      this.tokenExpiry = Date.now() + 7 * 24 * 60 * 60 * 1000;
      logger.info('🚀 Shiprocket API authenticated successfully');
      return this.token;
    } catch (err) {
      logger.error('Shiprocket auth error:', err.message);
      return null;
    }
  }

  /**
   * Book a live ad-hoc shipment order and assign AWB
   * 
   * @param {Object} orderData
   * @returns {Promise<{ awb: string, courierName: string, labelUrl: string, shipmentId: string }>}
   */
  async createAndAssignShipment(orderData) {
    const token = await this.getAuthToken();

    if (!token) {
      // Local fallback simulation with realistic AWB
      const simulatedCarrier = orderData.carrierType || 'DELHIVERY';
      const randomAwb = `${simulatedCarrier.slice(0, 3)}-${Date.now().toString().slice(-8)}`;
      logger.info(`📦 [COURIER-SIMULATION] Assigned AWB: ${randomAwb} for order ${orderData.orderId || 'DIRECT'}`);
      return {
        isLive: false,
        awb: randomAwb,
        courierName: simulatedCarrier,
        labelUrl: `/api/shipments/labels/${randomAwb}.pdf`,
        shipmentId: `sim_${Date.now()}`,
      };
    }

    try {
      // Step 1: Create Adhoc Order
      const payload = {
        order_id: String(orderData.orderId || Date.now()),
        order_date: new Date().toISOString().slice(0, 10),
        pickup_location: orderData.warehouseCode || 'Primary Hub',
        billing_customer_name: orderData.customerName || 'Consignee',
        billing_last_name: '',
        billing_address: orderData.address || 'Commercial Center',
        billing_city: orderData.city || 'Mumbai',
        billing_pincode: Number(orderData.pincode) || 400001,
        billing_state: orderData.state || 'Maharashtra',
        billing_country: 'India',
        billing_email: orderData.email || 'billing@acustock.internal',
        billing_phone: String(orderData.phone || '9876543210').replace(/\D/g, '').slice(-10),
        shipping_is_billing: true,
        order_items: [
          {
            name: orderData.productName || 'Equipment Unit',
            sku: orderData.sku || 'SKU-ITEM',
            units: Number(orderData.quantity) || 1,
            selling_price: Number(orderData.price) || 100,
          },
        ],
        payment_method: orderData.deliveryType === 'COD' ? 'COD' : 'Prepaid',
        sub_total: Number(orderData.price || 100) * Number(orderData.quantity || 1),
        length: 20,
        breadth: 15,
        height: 10,
        weight: Number(orderData.weight) || 1.5,
      };

      const orderRes = await fetch(`${this.baseUrl}/orders/create/adhoc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });

      const orderJson = await orderRes.json();
      const shipmentId = orderJson.shipment_id || orderJson.order_id;

      if (!shipmentId) {
        throw new Error(orderJson.message || 'Shiprocket order creation returned no shipment_id');
      }

      // Step 2: Assign AWB
      const awbRes = await fetch(`${this.baseUrl}/courier/assign/awb`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ shipment_id: shipmentId }),
        signal: AbortSignal.timeout(10000),
      });

      const awbJson = await awbRes.json();
      const awb = awbJson?.response?.data?.awb_code || `AWB-${shipmentId}`;
      const courierName = awbJson?.response?.data?.courier_name || 'Shiprocket Express';

      // Step 3: Generate Shipping Label
      let labelUrl = null;
      try {
        const labelRes = await fetch(`${this.baseUrl}/courier/generate/label`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ shipment_id: [shipmentId] }),
        });
        const labelJson = await labelRes.json();
        labelUrl = labelJson?.label_url || null;
      } catch (labelErr) {
        logger.warn('Could not pre-fetch label URL:', labelErr.message);
      }

      return {
        isLive: true,
        awb,
        courierName,
        labelUrl: labelUrl || `/api/shipments/labels/${awb}.pdf`,
        shipmentId: String(shipmentId),
      };
    } catch (err) {
      logger.error('Shiprocket order creation error:', err.message);
      // Graceful fallback so user's delivery creation is never blocked
      const fallbackAwb = `AWB-${Date.now().toString().slice(-8)}`;
      return {
        isLive: false,
        awb: fallbackAwb,
        courierName: orderData.carrierType || 'Delhivery',
        labelUrl: `/api/shipments/labels/${fallbackAwb}.pdf`,
        shipmentId: `fb_${Date.now()}`,
      };
    }
  }
}

module.exports = new ShiprocketService();

