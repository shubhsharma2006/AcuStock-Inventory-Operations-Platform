const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Tenant = require('../models/Tenant');

function getSocketAuthToken(socket) {
  const authToken = socket?.handshake?.auth?.token;
  if (typeof authToken === 'string' && authToken.trim()) {
    return authToken.trim();
  }

  const queryToken = socket?.handshake?.query?.token;
  if (Array.isArray(queryToken)) {
    const firstToken = queryToken[0];
    if (typeof firstToken === 'string' && firstToken.trim()) {
      return firstToken.trim();
    }
  } else if (typeof queryToken === 'string' && queryToken.trim()) {
    return queryToken.trim();
  }

  const cookieHeader = socket?.handshake?.headers?.cookie;
  if (typeof cookieHeader === 'string') {
    const cookiePairs = cookieHeader.split(';').map((entry) => entry.trim());
    const authCookie = cookiePairs.find((entry) => entry.startsWith('authToken='));
    if (authCookie) {
      const [, rawToken] = authCookie.split('=');
      if (typeof rawToken === 'string' && rawToken.trim()) {
        return rawToken.trim();
      }
    }
  }

  return null;
}

async function authenticateSocketConnection(socket) {
  const token = getSocketAuthToken(socket);
  if (!token) {
    return null;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.mfaPending === true || decoded.purpose === 'MFA_AUTHENTICATION') {
      return null;
    }
    const user = await User.findById(decoded._id).select('_id role isActive tokenVersion tenantId');

    if (!user || !user.isActive) {
      return null;
    }

    if (decoded.tokenVersion !== undefined && user.tokenVersion !== decoded.tokenVersion) {
      return null;
    }

    if (!user.tenantId || (decoded.tenantId && String(decoded.tenantId) !== String(user.tenantId))) {
      return null;
    }

    const tenant = await Tenant.findById(user.tenantId).select('_id isActive status');
    if (!tenant || !tenant.isActive || ['SUSPENDED', 'CANCELED'].includes(tenant.status)) {
      return null;
    }

    return user;
  } catch (error) {
    return null;
  }
}

function canJoinRoleRoom(user, role) {
  if (!user?.role) {
    return false;
  }

  const roleHierarchy = { USER: 1, MANAGER: 2, ADMIN: 3, SUPER_ADMIN: 4 };
  const userRole = String(user.role).toUpperCase();
  const targetRole = String(role || '').toUpperCase();

  const userLevel = roleHierarchy[userRole] || 0;
  const targetLevel = roleHierarchy[targetRole] || 0;

  return userLevel >= targetLevel;
}

function canJoinUserRoom(user, targetUserId) {
  if (!user) {
    return false;
  }

  const target = String(targetUserId || '').trim();
  if (!target) {
    return false;
  }

  if (user._id && String(user._id) === target) {
    return true;
  }

  return ['ADMIN', 'SUPER_ADMIN'].includes(String(user.role || '').toUpperCase());
}

module.exports = {
  getSocketAuthToken,
  authenticateSocketConnection,
  canJoinRoleRoom,
  canJoinUserRoom
};
