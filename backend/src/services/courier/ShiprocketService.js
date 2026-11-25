/**
 * Shiprocket Courier Integration Service
 * 
 * Provides live automated courier booking, AWB generation, and shipping label
 * fetching via the official Shiprocket B2B API (v2).
 * 
 * Aggregates carriers: Delhivery, Blue Dart, DTDC, Shadowfax, Ecom Express.
 * Booking stages are checkpointed by the shipments API.
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

  async post(path, token, payload) {
    const response = await fetch(this.baseUrl + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) throw new Error(`Carrier returned HTTP ${response.status}`);
    return response.json();
  }

  orderPayload(s) {
    const dimension = String(s.dimensions || '').trim().match(/^(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)$/i);
    const mass = String(s.weight || '').trim().match(/^(\d+(?:\.\d+)?)\s*(?:kg)?$/i);
    const total = s.deliveryType === 'COD' ? s.codAmount : s.prepaidAmount;
    if (!dimension || !mass || ![...dimension.slice(1), mass[1]].every(v => Number.isFinite(Number(v)) && Number(v) > 0)
        || Number(s.boxes || 1) !== 1) throw new Error('Enter one parcel with its measured weight in kg and L x W x H in cm.');
    if (!s.originWarehouse?.trim() || !s.customerName || !s.address || !s.city || !s.state || !s.email ||
        !/^\d{6}$/.test(s.pincode) || !/^(?:91)?\d{10}$/.test(String(s.phone).replace(/[^\d]/g, ''))) {
      throw new Error('Enter the registered pickup location and complete recipient contact and address details.');
    }
    if (!['COD', 'Prepaid'].includes(s.deliveryType) || !Number.isFinite(total) || total <= 0 ||
        !Number.isInteger(s.quantity) || s.quantity < 1) throw new Error('Enter a positive order amount and quantity for prepaid or COD shipping.');
    return {
      order_id: String(s._id), order_date: new Date(s.createdAt || Date.now()).toISOString().slice(0, 10),
      pickup_location: s.originWarehouse.trim(), billing_customer_name: s.customerName, billing_last_name: '',
      billing_address: s.address, billing_city: s.city, billing_pincode: s.pincode, billing_state: s.state,
      billing_country: 'India', billing_email: s.email, billing_phone: String(s.phone).replace(/\D/g, '').slice(-10),
      shipping_is_billing: true, order_items: [{ name: s.productName, sku: String(s.productId), units: s.quantity,
        selling_price: total / s.quantity }], payment_method: s.deliveryType, sub_total: total,
      length: Number(dimension[1]), breadth: Number(dimension[2]), height: Number(dimension[3]), weight: Number(mass[1])
    };
  }

  async performStep(step, shipment, token, order) {
    const shipmentId = shipment.carrierBooking?.shipmentId;
    if (step === 'ORDER') {
      const result = await this.post('/orders/create/adhoc', token, order);
      if (!Number(result.shipment_id)) throw new Error('Carrier did not confirm an order.');
      return { 'carrierBooking.shipmentId': String(result.shipment_id) };
    }
    if (step === 'AWB') {
      const result = await this.post('/courier/assign/awb', token, { shipment_id: shipmentId });
      const data = result.response?.data;
      if (Number(result.awb_assign_status) !== 1 || !data?.awb_code) throw new Error('Carrier did not confirm an AWB.');
      return { awb: String(data.awb_code), courier: data.courier_name || 'Shiprocket' };
    }
    if (step === 'LABEL') {
      const result = await this.post('/courier/generate/label', token, { shipment_id: [shipmentId] });
      if (!result.label_url || new URL(result.label_url).protocol !== 'https:') throw new Error('Carrier did not return a printable label.');
      return { labelUrl: result.label_url };
    }
    if (step !== 'PICKUP') throw new Error('Unknown booking step.');
    const result = await this.post('/courier/generate/pickup', token, { shipment_id: [shipmentId] });
    if (Number(result.pickup_status) !== 1) throw new Error('Carrier did not confirm the pickup request.');
    return { 'carrierBooking.pickupDate': result.response?.pickup_scheduled_date || null };
  }
}

module.exports = new ShiprocketService();
