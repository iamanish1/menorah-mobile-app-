const request = require('supertest');
const { createExpressApp } = require('../createExpressApp');
const { mountRouteProfile } = require('../routeProfiles');
const notFound = require('../../../middleware/notFound');
const errorHandler = require('../../../middleware/errorHandler');

const buildProfileApp = (profileName) => {
  const state = {
    serviceName: profileName,
    routeProfile: profileName,
    serviceRuntime: 'test',
    booted: true,
    redisReady: false,
    redisRequired: false
  };
  const { app } = createExpressApp({
    serviceName: profileName,
    getHealthState: () => state
  });

  mountRouteProfile(app, profileName);
  app.use(notFound);
  app.use(errorHandler);
  return app;
};

describe('route profiles', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = 'x'.repeat(64);
    process.env.NODE_ENV = 'test';
  });

  test('api-ios exposes booking payments but blocks subscription payments', async () => {
    const app = buildProfileApp('api-ios');

    await request(app)
      .post('/api/payments/create-checkout-session')
      .send({ bookingId: '64f000000000000000000000' })
      .expect(401);

    await request(app)
      .post('/api/payments/verify-razorpay')
      .send({
        bookingId: '64f000000000000000000000',
        razorpay_order_id: 'order_test',
        razorpay_payment_id: 'pay_test',
        razorpay_signature: 'signature_test'
      })
      .expect(401);

    await request(app)
      .get('/api/payments/order/order_test/status')
      .expect(401);

    await request(app)
      .get('/api/payments/booking/64f000000000000000000000')
      .expect(401);

    await request(app)
      .post('/api/payments/booking/create-order')
      .send({ bookingId: '64f000000000000000000000' })
      .expect(401);

    await request(app)
      .post('/api/payments/create-booking-order')
      .send({ bookingId: '64f000000000000000000000' })
      .expect(401);

    await request(app)
      .post('/api/payments/booking/verify')
      .send({
        bookingId: '64f000000000000000000000',
        razorpay_order_id: 'order_test',
        razorpay_payment_id: 'pay_test',
        razorpay_signature: 'signature_test'
      })
      .expect(401);

    await request(app)
      .post('/api/payments/verify-booking-payment')
      .send({
        bookingId: '64f000000000000000000000',
        razorpay_order_id: 'order_test',
        razorpay_payment_id: 'pay_test',
        razorpay_signature: 'signature_test'
      })
      .expect(401);

    await request(app)
      .get('/api/payments/booking/order/order_test/status')
      .expect(401);

    await request(app)
      .get('/api/payments/booking/64f000000000000000000000/status')
      .expect(401);

    await request(app)
      .post('/api/payments/create-subscription-checkout')
      .send({ subscriptionType: 'monthly' })
      .expect(404);

    await request(app)
      .post('/api/payments/verify-subscription-payment')
      .send({})
      .expect(404);

    await request(app)
      .get('/api/payments/subscription/status')
      .expect(404);

    await request(app)
      .post('/api/payments/subscription/create-order')
      .send({ subscriptionType: 'monthly' })
      .expect(404);

    await request(app)
      .post('/api/payments/subscription/verify')
      .send({ subscriptionType: 'monthly' })
      .expect(404);

    await request(app)
      .post('/api/payments/razorpay-webhook')
      .send({})
      .expect(404);

    await request(app)
      .post('/api/payments/future-non-booking-payment-route')
      .send({})
      .expect(404);
  });

  test('api-ios does not expose admin routes', async () => {
    const app = buildProfileApp('api-ios');

    await request(app)
      .get('/api/admin/stats')
      .expect(404);

    await request(app)
      .get('/api/articles/admin')
      .expect(404);
  });

  test('api-android and api-web keep full payment router mounted', async () => {
    await request(buildProfileApp('api-android'))
      .post('/api/payments/create-subscription-checkout')
      .send({ subscriptionType: 'monthly' })
      .expect(401);

    await request(buildProfileApp('api-web'))
      .post('/api/payments/create-subscription-checkout')
      .send({ subscriptionType: 'monthly' })
      .expect(401);
  });

  test('user-facing api profiles expose social auth routes with validation', async () => {
    for (const profileName of ['api-ios', 'api-android', 'api-web']) {
      const app = buildProfileApp(profileName);

      await request(app)
        .post('/api/auth/google')
        .send({})
        .expect(400);

      await request(app)
        .post('/api/auth/apple')
        .send({})
        .expect(400);
    }
  });

  test('user-facing api profiles expose only authenticated assessment routes', async () => {
    for (const profileName of ['api-ios', 'api-android', 'api-web']) {
      await request(buildProfileApp(profileName))
        .get('/api/assessments/instruments/gad-7')
        .expect(401);
    }

    await request(buildProfileApp('api-admin'))
      .get('/api/assessments/instruments/gad-7')
      .expect(404);
  });

  test('api-admin exposes admin routes but not public payment checkout', async () => {
    const app = buildProfileApp('api-admin');

    await request(app)
      .get('/api/auth/me')
      .expect(401);

    await request(app)
      .post('/api/auth/login')
      .send({})
      .expect(400);

    // Verification is intentionally exposed only through the admin-scoped
    // router; it lets an unverified admin cross the account-state boundary
    // without mounting the patient registration or social-auth routes here.
    await request(app)
      .post('/api/auth/verify-email')
      .send({})
      .expect(400);

    await request(app)
      .post('/api/auth/resend-email-verification')
      .send({})
      .expect(200);

    await request(app)
      .post('/api/auth/register')
      .send({})
      .expect(404);

    await request(app)
      .post('/api/auth/forgot-password')
      .send({})
      .expect(404);

    await request(app)
      .post('/api/auth/verify-email-otp')
      .send({})
      .expect(404);

    await request(app)
      .post('/api/auth/google')
      .send({})
      .expect(404);

    await request(app)
      .post('/api/auth/apple')
      .send({})
      .expect(404);

    await request(app)
      .get('/api/admin/stats')
      .expect(401);

    await request(app)
      .get('/api/admin/server-usage')
      .expect(401);

    await request(app)
      .post('/api/articles/admin')
      .send({})
      .expect(401);

    await request(app)
      .post('/api/admin/social-studio/posts')
      .send({})
      .expect(401);

    await request(app)
      .post('/api/payments/create-checkout-session')
      .send({ bookingId: '64f000000000000000000000' })
      .expect(404);
  });
});
