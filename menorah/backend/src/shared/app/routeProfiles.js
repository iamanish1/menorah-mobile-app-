const authRoutes = require('../../routes/auth');
const adminAuthRoutes = require('../../routes/auth-admin');
const userRoutes = require('../../routes/users');
const counsellorRoutes = require('../../routes/counsellors');
const counsellorBookingsRoutes = require('../../routes/counsellor-bookings');
const bookingRoutes = require('../../routes/bookings');
const paymentRoutes = require('../../routes/payments');
const paymentIosRoutes = require('../../routes/payments-ios');
const payoutWebhookRoutes = require('../../routes/payout-webhook');
const chatRoutes = require('../../routes/chat');
const videoRoutes = require('../../routes/video');
const adminRoutes = require('../../routes/admin');
const articleRoutes = require('../../routes/articles');
const publicArticleRoutes = require('../../routes/articles-public');
const socialStudioRoutes = require('../../routes/socialStudio');
const ekycRoutes = require('../../routes/ekyc');
const privacyRoutes = require('../../routes/privacy');
const privacyAdminRoutes = require('../../routes/privacy-admin');
const emailWebhookRoutes = require('../../routes/email-webhook');
const assessmentRoutes = require('../../routes/assessments');

const routeDefinitions = {
  auth: { mountPath: '/api/auth', router: authRoutes },
  'auth-admin': { mountPath: '/api/auth', router: adminAuthRoutes },
  users: { mountPath: '/api/users', router: userRoutes },
  counsellors: { mountPath: '/api/counsellors', router: counsellorRoutes },
  'counsellor-bookings': { mountPath: '/api/counsellors', router: counsellorBookingsRoutes },
  bookings: { mountPath: '/api/bookings', router: bookingRoutes },
  'payments-full': { mountPath: '/api/payments', router: paymentRoutes },
  'payments-ios-booking-only': { mountPath: '/api/payments', router: paymentIosRoutes },
  'payout-webhook': { mountPath: '/api/payouts/webhook', router: payoutWebhookRoutes },
  chat: { mountPath: '/api/chat', router: chatRoutes },
  video: { mountPath: '/api/video', router: videoRoutes },
  'articles-public': { mountPath: '/api/articles', router: publicArticleRoutes },
  'articles-admin': { mountPath: '/api/articles', router: articleRoutes },
  ekyc: { mountPath: '/api/ekyc', router: ekycRoutes },
  'privacy-user': { mountPath: '/api/privacy', router: privacyRoutes },
  'privacy-admin': { mountPath: '/api/privacy', router: privacyAdminRoutes },
  assessments: { mountPath: '/api/assessments', router: assessmentRoutes },
  'email-webhook': { mountPath: '/api/email', router: emailWebhookRoutes },
  'admin-social-studio': { mountPath: '/api/admin/social-studio', router: socialStudioRoutes },
  admin: { mountPath: '/api/admin', router: adminRoutes }
};

const routeProfiles = {
  'api-ios': [
    'auth',
    'users',
    'counsellors',
    'counsellor-bookings',
    'bookings',
    'payments-ios-booking-only',
    'chat',
    'video',
    'articles-public',
    'ekyc',
    'privacy-user',
    'assessments'
  ],
  'api-android': [
    'auth',
    'users',
    'counsellors',
    'counsellor-bookings',
    'bookings',
    'payments-full',
    'chat',
    'video',
    'articles-public',
    'ekyc',
    'privacy-user',
    'assessments'
  ],
  'api-web': [
    'auth',
    'users',
    'counsellors',
    'counsellor-bookings',
    'bookings',
    'payments-full',
    'articles-public',
    'video',
    'chat',
    'email-webhook',
    'privacy-user',
    'assessments'
  ],
  'api-admin': [
    'auth-admin',
    'payout-webhook',
    'admin-social-studio',
    'privacy-admin',
    'admin',
    'articles-admin'
  ]
};

const mountRouteProfile = (app, profileName) => {
  const profile = routeProfiles[profileName];
  if (!profile) {
    throw new Error(`Unknown route profile: ${profileName}`);
  }

  profile.forEach((routeKey) => {
    const route = routeDefinitions[routeKey];
    if (!route) {
      throw new Error(`Route definition not found: ${routeKey}`);
    }
    app.use(route.mountPath, route.router);
  });

  return profile;
};

module.exports = {
  routeDefinitions,
  routeProfiles,
  mountRouteProfile
};
