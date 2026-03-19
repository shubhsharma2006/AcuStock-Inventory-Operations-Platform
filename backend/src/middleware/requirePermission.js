
const Permission = require('../models/permission');

/**
 * requirePermission
 * Usage: requirePermission('canManageUsers')
 * Enforces fine-grained permission checks independent of role.
 * SUPER_ADMIN inherits all ADMIN permissions automatically.
 */
module.exports = (permissionKey) => {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.role) {
        return res.status(401).json({ message: 'Unauthenticated' });
      }

      // SUPER_ADMIN gets full ADMIN permission set — look up the ADMIN profile
      const lookupRole = req.user.role === 'SUPER_ADMIN' ? 'ADMIN' : req.user.role;

      const permission = await Permission.findOne({ role: lookupRole });

      if (!permission) {
        return res.status(403).json({ message: 'Permission profile not found' });
      }

      if (!permission[permissionKey]) {
        return res.status(403).json({
          message: `Permission denied: ${permissionKey}`
        });
      }

      next();
    } catch (err) {
      console.error('Permission middleware error:', err);
      res.status(500).json({ message: 'Permission validation failed' });
    }
  };
};