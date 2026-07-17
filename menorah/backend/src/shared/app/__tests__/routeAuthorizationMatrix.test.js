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
  'video:POST:/livekit-webhook',
]);

const expandRoute = (routerKey, layer) => {
  const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
  const methods = Object.keys(layer.route.methods).map((method) => method.toUpperCase());
  return paths.flatMap((routePath) => methods.map((method) => ({
    key: `${routerKey}:${method}:${routePath}`,
    method,
    path: routePath,
    middleware: layer.route.stack.map((handler) => handler.name),
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
});
