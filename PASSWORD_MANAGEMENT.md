# AcuStock Password Management System

## Overview

This document describes the comprehensive, production-ready password management system implemented for the AcuStock inventory management application.

## Security Principles

1. **No plaintext passwords** - All passwords are hashed using bcrypt with 12 salt rounds
2. **No localStorage** - No sensitive data stored in browser storage
3. **HTTP-only cookies** - JWT tokens stored in secure HTTP-only cookies
4. **Backend as source of truth** - All password operations validated server-side
5. **Audit trail** - All password-related actions logged for security auditing

## Database Schema

### User Model Fields

| Field | Type | Description |
|-------|------|-------------|
| `password` | String | Bcrypt hashed password (select: false) |
| `passwordChangedAt` | Date | Timestamp of last password change |
| `passwordChangedBy` | Enum | Who changed: SELF, ADMIN, MANAGER, SYSTEM |
| `forcePasswordReset` | Boolean | Forces password change on next login |
| `passwordResetToken` | String | Hashed token for forgot password flow |
| `passwordResetExpires` | Date | Token expiration time |
| `failedLoginAttempts` | Number | Counter for monitoring (no lockout) |
| `tokenVersion` | Number | Incremented to invalidate existing sessions |

### AuditLog Model

Tracks all security-relevant events with automatic 1-year TTL:

| Field | Description |
|-------|-------------|
| `action` | Event type (PASSWORD_CHANGE, PASSWORD_RESET, etc.) |
| `userId` | User who was affected |
| `performedBy` | User who performed the action |
| `targetUser` | Target of the action (for admin resets) |
| `details` | Additional context |
| `ipAddress` | Client IP address |
| `userAgent` | Browser user agent |
| `createdAt` | Timestamp with TTL index |

## API Endpoints

### Authentication Routes (`/api/auth`)

#### POST `/api/auth/login`
- Failed attempt tracking (monitoring only, no lockout)
- Force password reset detection
- Audit logging for all attempts

#### POST `/api/auth/change-password`
- Self-service password change
- Clears `forcePasswordReset` flag
- Increments `tokenVersion` (invalidates other sessions)
- Creates audit log entry
- Sends notification

#### POST `/api/auth/forgot-password`
- Generates secure reset token (SHA256 hashed)
- 15-minute expiration
- Email with reset link (console logged in dev)

#### POST `/api/auth/reset-password/:token`
- Validates token and expiration
- Sets new password
- Clears `forcePasswordReset`
- Audit logged

#### GET `/api/auth/verify-reset-token`
- Validates token without consuming it
- Returns user email for UI display

#### GET `/api/auth/audit-logs` (Admin only)
- Retrieve security audit logs
- Pagination support

### Settings Routes (`/api/settings`)

#### POST `/api/settings/reset-password` (Admin/Manager)
- Admin resets any user's password
- Manager resets their users' passwords
- Option: `generateTemporary: true` for auto-generated password
- Always sets `forcePasswordReset: true`
- Increments `tokenVersion`
- Audit logged

#### GET `/api/settings/users/:id/password-info` (Admin only)
- Returns password metadata (NEVER the actual password)
- Shows: last changed, changed by, force reset status, lock status

#### POST `/api/settings/users/:id/unlock` (Admin only)
- Unlocks a locked account
- Resets failed login attempts
- Audit logged

#### GET `/api/settings/users/password-summary` (Admin only)
- Dashboard summary of all user password statuses
- Counts: forced resets, locked accounts, never changed

## Password Flows

### 1. Self Password Change

```
User → Profile/Settings → Change Password
     → Enter new password
     → POST /api/auth/change-password
     → passwordChangedAt = now
     → passwordChangedBy = SELF
     → forcePasswordReset = false
     → tokenVersion++ (other sessions invalidated)
     → Audit logged
     → Notification sent
```

### 2. Admin/Manager Password Reset

```
Admin/Manager → Account Control → Select User → Reset Password
             → Enter/Generate password
             → POST /api/settings/reset-password
             → password = bcrypt(newPassword)
             → passwordChangedAt = now
             → passwordChangedBy = ADMIN/MANAGER
             → forcePasswordReset = true
             → tokenVersion++ (user sessions invalidated)
             → Audit logged
             
User → Next Login → Forced to change password
    → POST /api/auth/change-password
    → forcePasswordReset = false
    → passwordChangedBy = SELF
```

### 3. Forgot Password Flow

```
User → Login Page → Forgot Password
     → Enter email
     → POST /api/auth/forgot-password
     → Generate secure token
     → Email reset link
     
User → Click reset link
     → GET /api/auth/verify-reset-token (validate)
     → Enter new password
     → POST /api/auth/reset-password/:token
     → Password updated
     → Token cleared
     → forcePasswordReset = false
     → Audit logged
```

### 4. Failed Login Tracking

```
User → Failed login attempt
     → failedLoginAttempts++ (for monitoring)
     → Error message: "Invalid credentials. Please try again."
     
Admin → Can view failed attempts in password info
      → POST /api/settings/users/:id/reset-failed-attempts (if needed)
```

## Security Features

### Token Security
- **Reset tokens**: SHA256 hashed before storage
- **Expiration**: 15 minutes
- **Single use**: Cleared after use

### Session Invalidation
- `tokenVersion` incremented on password change
- All existing JWT tokens become invalid
- Forces re-authentication

### Temporary Passwords
- Generated format: `[Adjective][Noun][Number]!`
- Example: `QuickTiger123!`
- User MUST change on next login

## Frontend Components

### Admin Dashboard

1. **Account Control Panel**
   - User selection dropdown
   - Password info display (never shows actual password)
   - Unlock account button (for locked accounts)
   - Reset password modal with generate temporary option

2. **Force Password Reset Modal**
   - Displayed when `forcePasswordReset = true`
   - Blocks access until password changed
   - Clean, secure UI

### Manager Dashboard

1. **User Management**
   - Reset password for managed users
   - Generate temporary password option
   - Force password reset on next login

2. **Force Password Reset Modal**
   - Same behavior as admin dashboard

### User Dashboard

1. **Profile Settings**
   - Change own password
   - Current password required

2. **Force Password Reset Modal**
   - Displayed when admin/manager requires reset

## Audit Events

| Action | Description |
|--------|-------------|
| `PASSWORD_CHANGE` | User changed their own password |
| `PASSWORD_RESET` | Admin/Manager reset a user's password |
| `PASSWORD_RESET_REQUEST` | Forgot password request initiated |
| `PASSWORD_RESET_COMPLETE` | Password reset via email link completed |
| `FAILED_LOGIN` | Failed login attempt recorded |
| `SUCCESSFUL_LOGIN` | Successful login recorded |
| `ACCOUNT_LOCKED` | Account locked due to failed attempts |
| `ACCOUNT_UNLOCKED` | Admin unlocked an account |
| `FORCE_LOGOUT` | Admin force-logged out a user |

## Configuration

### Password Requirements
- Minimum 8 characters
- (Can be extended with complexity rules)

### Bcrypt Salt Rounds
- Currently: 12 (production-ready)

### Token Expiration
- Reset token: 15 minutes
- JWT: 7 days (configurable in auth routes)

### Failed Login Tracking
- Failed attempts are tracked for monitoring purposes
- No automatic account lockout (unlimited attempts allowed)
- Admin can view failed attempts in password info

## Testing Checklist

- [ ] Self password change
- [ ] Admin password reset with manual password
- [ ] Admin password reset with generated temporary
- [ ] Manager password reset for their users
- [ ] Forgot password email flow
- [ ] Reset password link validation
- [ ] Force password reset on next login
- [ ] Session invalidation after password change
- [ ] Audit log entries for all actions
- [ ] Password info display (no actual password shown)
- [ ] Failed login attempts tracking

## Notes

- Email sending is logged to console in development
- For production, integrate with actual email service (SendGrid, SES, etc.)
- All timestamps stored in UTC
- Audit logs auto-expire after 1 year (TTL index)
- No account lockout implemented (multiple failed attempts allowed)
