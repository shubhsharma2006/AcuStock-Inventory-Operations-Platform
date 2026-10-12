/**
 * AcuStock WhatsApp Phone Resolver
 * 
 * Securely maps inbound phone numbers to authenticated users and tenants.
 * Invariant: Never trusts or executes tools for an unverified phone number.
 */

const User = require('../../models/User');
const { SecurityContext } = require('../core/context');
const logger = require('../../utils/logger');

class PhoneResolver {
  /**
   * Normalize phone number to digits only
   * e.g. "+91 98765-43210" -> "919876543210"
   */
  normalizePhone(phone) {
    if (!phone || typeof phone !== 'string') return '';
    return phone.replace(/\D/g, '');
  }

  /**
   * Resolve caller by phone number and construct SecurityContext
   * 
   * @param {string} incomingPhone - Raw phone number from WhatsApp webhook
   * @returns {Promise<{ authenticated: boolean, securityContext?: SecurityContext, user?: Object, error?: string }>}
   */
  async resolveSecurityContext(incomingPhone) {
    const cleanNumber = this.normalizePhone(incomingPhone);
    if (!cleanNumber) {
      return { authenticated: false, error: 'INVALID_PHONE_FORMAT' };
    }

    // Match exact digits or last 10 digits (national format)
    const last10Digits = cleanNumber.slice(-10);

    const user = await User.findOne({
      phone: { $regex: new RegExp(last10Digits + '$') },
      isActive: true
    }).populate('tenantId');

    if (!user) {
      logger.warn(`WhatsApp incoming from unregistered phone: [${incomingPhone}]`);
      return {
        authenticated: false,
        error: 'USER_NOT_FOUND',
        cleanNumber
      };
    }

    if (!user.tenantId || !user.tenantId._id) {
      logger.warn(`WhatsApp user [${user.email}] has no active tenant assigned.`);
      return {
        authenticated: false,
        error: 'NO_ACTIVE_TENANT'
      };
    }

    // Seal security context
    const securityContext = new SecurityContext({
      user: {
        _id: user._id,
        role: user.role,
        name: user.name,
        email: user.email || '',
        assignedWarehouseId: user.assignedWarehouseId || null
      },
      tenantId: user.tenantId._id.toString(),
      source: 'whatsapp'
    });

    return {
      authenticated: true,
      securityContext,
      user
    };
  }
}

module.exports = new PhoneResolver();
