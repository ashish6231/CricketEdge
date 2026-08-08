const PERMISSION_MATRIX = [
  { feature: 'Dashboard & stats', admin: true, superadmin: true },
  { feature: 'View / manage users', admin: true, superadmin: true },
  { feature: 'Grant / revoke Pro (users only)', admin: true, superadmin: true },
  { feature: 'Pro Users / Former Pro / Sub Logs', admin: true, superadmin: true },
  { feature: 'Audit logs', admin: true, superadmin: true },
  { feature: 'View coupons', admin: true, superadmin: true },
  { feature: 'Create / edit coupons', admin: false, superadmin: true },
  { feature: 'Plans & pricing', admin: false, superadmin: true },
  { feature: 'Site settings', admin: false, superadmin: true },
  { feature: 'Create / manage admins', admin: false, superadmin: true },
  { feature: 'Promote / demote roles', admin: false, superadmin: true },
];

const ADMIN_CAPABILITIES = {
  admin: PERMISSION_MATRIX.filter(p => p.admin).map(p => p.feature),
  superadmin: PERMISSION_MATRIX.filter(p => p.superadmin).map(p => p.feature),
};

module.exports = { PERMISSION_MATRIX, ADMIN_CAPABILITIES };
