const { routeDefinitions } = require('../routeProfiles');

const AUTH_MIDDLEWARE = new Set(['auth', 'authAny', 'adminAuth', 'counsellorAuth']);
const INHERITED_ADMIN_ROUTERS = new Set(['admin', 'admin-social-studio']);
const DELEGATED_AUTH_ROUTERS = new Set(['payments-ios-booking-only']);

const PUBLIC_ROUTES = new Set([
  'auth:POST:/register',
  'auth:POST:/verify-email-otp',
  'auth:POST:/resend-email-otp',
  'auth:POST:/login',
  'auth:POST:/google',
  'auth:POST:/apple',
  'auth:POST:/verify-email',
  'auth:POST:/verify-phone',
  'auth:POST:/resend-email-verification',
  'auth:POST:/forgot-password',
  'auth:GET:/reset-password',
  'auth:POST:/reset-password',
  'auth-admin:POST:/login',
  'auth-admin:POST:/admin/login',
  'auth-admin:POST:/login/mfa',
  'auth-admin:POST:/admin/login/mfa',
  'users:GET:/:id',
  'counsellors:GET:/' ,
  'counsellors:GET:/specializations',
  'counsellors:GET:/languages',
  'counsellors:GET:/verification-requirements',
  'counsellors:GET:/:id',
  'counsellors:GET:/:id/availability',
  'counsellors:POST:/register',
  'articles-public:GET:/' ,
  'articles-public:GET:/categories/list',
  'articles-public:GET:/:slug',
  'articles-admin:GET:/' ,
  'articles-admin:GET:/categories/list',
  'articles-admin:GET:/:slug',
]);

const TICKET_ROUTES = new Set([
  'counsellors:GET:/application-status',
  'video:POST:/meet/redeem',
  'video:GET:/meet',
]);

const SIGNED_WEBHOOK_ROUTES = new Set([
  'payments-full:POST:/razorpay-webhook',
  'payout-webhook:POST:/',
  'video:POST:/livekit-webhook',
]);

const ADMIN_ROUTE_PERMISSIONS = Object.freeze({
  'GET:/stats': 'platform_read',
  'GET:/stats/users': 'support_read',
  'GET:/server-usage': 'platform_read',
  'GET:/counsellors': 'clinical_read',
  'GET:/counsellors/:id': 'clinical_read',
  'PUT:/counsellors/:id/start-review': 'clinical_manage',
  'PUT:/counsellors/:id/approve': 'clinical_manage',
  'PUT:/counsellors/:id/reject': 'clinical_manage',
  'POST:/counsellors/:id/generate-password': 'clinical_manage',
  'PUT:/counsellors/:id/block': 'clinical_manage',
  'POST:/counsellors/:id/reverification-invite': 'clinical_manage',
  'PUT:/counsellors/:id/expire': 'clinical_manage',
  'GET:/counsellors/:id/booking-stats': 'clinical_read',
  'GET:/users': 'support_read',
  'GET:/revenue': 'finance_read',
  'GET:/revenue/counsellors': 'finance_read',
  'GET:/revenue/counsellors/:id': 'finance_read',
  'POST:/payouts/:counsellorId': 'finance_payout_request',
  'POST:/payouts/:payoutId/approve': 'finance_payout_approve',
  'GET:/payouts': 'finance_read',
  'GET:/payouts/counsellor/:counsellorId': 'finance_read',
  'GET:/ekyc/reviews': 'clinical_read',
  'PUT:/ekyc/reviews/:id/approve': 'clinical_manage',
  'PUT:/ekyc/reviews/:id/reject': 'clinical_manage',
  'GET:/bookings': 'support_read',
  'PATCH:/bookings/:id/call-link': 'support_manage',
});

const ADMIN_FRESH_MFA_ROUTES = new Set([
  'admin:PUT:/counsellors/:id/start-review',
  'admin:PUT:/counsellors/:id/approve',
  'admin:PUT:/counsellors/:id/reject',
  'admin:POST:/counsellors/:id/generate-password',
  'admin:PUT:/counsellors/:id/block',
  'admin:POST:/counsellors/:id/reverification-invite',
  'admin:PUT:/counsellors/:id/expire',
  'admin:POST:/payouts/:payoutId/approve',
  'admin:PUT:/ekyc/reviews/:id/approve',
  'admin:PUT:/ekyc/reviews/:id/reject',
  'admin:PATCH:/bookings/:id/call-link',
]);

const expandRoute = (routerKey, layer) => {
  const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
  const methods = Object.keys(layer.route.methods).map((method) => method.toUpperCase());
  return paths.flatMap((routePath) => methods.map((method) => ({
    key: `${routerKey}:${method}:${routePath}`,
    method,
    path: routePath,
    middleware: layer.route.stack.map((handler) => handler.name),
    requiredAdminPermissions: layer.route.stack
      .map((handler) => handler.handle?.requiredAdminPermission)
      .filter(Boolean),
    requiresAssignedAdminRole: layer.route.stack
      .some((handler) => handler.handle?.requiresAssignedAdminRole === true),
  })));
};

describe('complete route authorization matrix', () => {
  const routes = Object.entries(routeDefinitions).flatMap(([routerKey, definition]) =>
    (definition.router.stack || [])
      .filter((layer) => layer.route)
      .flatMap((layer) => expandRoute(routerKey, layer).map((route) => ({ ...route, routerKey })))
  );

  test('every API route has an explicit access-control classification', () => {
    const unclassified = routes.filter((route) => {
      if (PUBLIC_ROUTES.has(route.key) || TICKET_ROUTES.has(route.key) || SIGNED_WEBHOOK_ROUTES.has(route.key)) return false;
      if (INHERITED_ADMIN_ROUTERS.has(route.routerKey) || DELEGATED_AUTH_ROUTERS.has(route.routerKey)) return false;
      return !route.middleware.some((name) => AUTH_MIDDLEWARE.has(name));
    });

    expect(unclassified.map((route) => route.key)).toEqual([]);
  });

  test('all object-ID routes outside the public catalogue require auth, a ticket, or a signed webhook', () => {
    const unprotectedIdRoutes = routes.filter((route) => {
      if (!route.path.includes(':')) return false;
      if (PUBLIC_ROUTES.has(route.key) || TICKET_ROUTES.has(route.key) || SIGNED_WEBHOOK_ROUTES.has(route.key)) return false;
      if (INHERITED_ADMIN_ROUTERS.has(route.routerKey) || DELEGATED_AUTH_ROUTERS.has(route.routerKey)) return false;
      return !route.middleware.some((name) => AUTH_MIDDLEWARE.has(name));
    });

    expect(unprotectedIdRoutes.map((route) => route.key)).toEqual([]);
  });

  test('public, ticket, and webhook allow-lists do not contain stale routes', () => {
    const routeKeys = new Set(routes.map((route) => route.key));
    const stale = [...PUBLIC_ROUTES, ...TICKET_ROUTES, ...SIGNED_WEBHOOK_ROUTES]
      .filter((key) => !routeKeys.has(key));

    expect(stale).toEqual([]);
  });

  test('every general admin route has the reviewed operational permission', () => {
    const actual = Object.fromEntries(
      routes
        .filter(({ routerKey }) => routerKey === 'admin')
        .map((route) => [
          `${route.method}:${route.path}`,
          route.requiredAdminPermissions[0],
        ])
    );

    expect(actual).toEqual(ADMIN_ROUTE_PERMISSIONS);
    expect(
      routes
        .filter(({ routerKey }) => routerKey === 'admin')
        .every(({ requiredAdminPermissions }) => requiredAdminPermissions.length === 1)
    ).toBe(true);
  });

  test('content, export, and privacy file/payload routes have independent permissions', () => {
    const articleAdminRoutes = routes.filter(
      ({ routerKey, path }) => routerKey === 'articles-admin' && path.startsWith('/admin')
    );
    expect(articleAdminRoutes).not.toHaveLength(0);
    expect(articleAdminRoutes.every(({ requiredAdminPermissions }) => (
      requiredAdminPermissions.length === 1
      && ['content_read', 'content_manage'].includes(requiredAdminPermissions[0])
    ))).toBe(true);

    const privacyAdminRoutes = routes.filter(({ routerKey }) => routerKey === 'privacy-admin');
    expect(privacyAdminRoutes).not.toHaveLength(0);
    expect(privacyAdminRoutes.every(({ requiredAdminPermissions }) => (
      requiredAdminPermissions.length === 1
      && requiredAdminPermissions[0] === 'privacy_access'
    ))).toBe(true);

    const socialRouter = routeDefinitions['admin-social-studio'].router;
    const inheritedSocialPermissions = (socialRouter.stack || [])
      .filter((layer) => !layer.route)
      .map((layer) => layer.handle?.requiredAdminPermission)
      .filter(Boolean);
    expect(inheritedSocialPermissions).toEqual(['content_manage']);
  });

  test('admin self-service rechecks a live role assignment without blocking logout', () => {
    const authAdminRoutes = routes.filter(({ routerKey }) => routerKey === 'auth-admin');
    const byKey = new Map(authAdminRoutes.map((route) => [route.key, route]));

    expect(byKey.get('auth-admin:GET:/me')?.requiresAssignedAdminRole).toBe(true);
    expect(byKey.get('auth-admin:PUT:/change-password')?.requiresAssignedAdminRole).toBe(true);
    expect(byKey.get('auth-admin:PUT:/admin/change-password')?.requiresAssignedAdminRole).toBe(true);
    expect(byKey.get('auth-admin:POST:/logout')?.requiresAssignedAdminRole).toBe(false);
    expect(byKey.get('auth-admin:POST:/logout-all')?.requiresAssignedAdminRole).toBe(false);
  });

  test('clinical, payout-approval, and call-link mutations retain fresh MFA', () => {
    const missingFreshMfa = routes
      .filter(({ key }) => ADMIN_FRESH_MFA_ROUTES.has(key))
      .filter(({ middleware }) => !middleware.includes('requireRecentAdminMfa'))
      .map(({ key }) => key);

    expect(missingFreshMfa).toEqual([]);
    expect(
      [...ADMIN_FRESH_MFA_ROUTES].every((key) => routes.some((route) => route.key === key))
    ).toBe(true);
  });
});
