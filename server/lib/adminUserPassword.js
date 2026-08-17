function validateAdminPasswordChange({ password, target } = {}) {
  if (typeof password !== 'string' || !password.trim()) {
    return { ok: false, status: 400, message: 'Password required' };
  }
  if (password.length < 6) {
    return { ok: false, status: 400, message: 'Password must be at least 6 characters' };
  }
  if (!target) {
    return { ok: false, status: 404, message: 'User not found' };
  }
  if (target.role === 'superadmin') {
    return { ok: false, status: 403, message: 'Cannot modify a superadmin' };
  }
  if (target.authProvider && target.authProvider !== 'local') {
    return { ok: false, status: 400, message: 'This account uses Google sign-in' };
  }
  return { ok: true };
}

module.exports = { validateAdminPasswordChange };
