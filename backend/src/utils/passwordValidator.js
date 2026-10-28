/**
 * Password complexity validation rules for AcuStock
 */
const PASSWORD_RULES = {
  minLength: 8,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireDigit: true,
  requireSpecial: false, // optional — avoids frustrating users
};

function validatePasswordStrength(password) {
  if (!password || typeof password !== 'string') return 'Password is required';
  if (password.length < PASSWORD_RULES.minLength) return `Password must be at least ${PASSWORD_RULES.minLength} characters`;
  if (password.length > PASSWORD_RULES.maxLength) return `Password must be at most ${PASSWORD_RULES.maxLength} characters`;
  if (PASSWORD_RULES.requireUppercase && !/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter';
  if (PASSWORD_RULES.requireLowercase && !/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter';
  if (PASSWORD_RULES.requireDigit && !/\d/.test(password)) return 'Password must contain at least one digit';
  if (PASSWORD_RULES.requireSpecial && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) return 'Password must contain at least one special character';
  return null; // valid
}

module.exports = {
  PASSWORD_RULES,
  validatePasswordStrength
};
