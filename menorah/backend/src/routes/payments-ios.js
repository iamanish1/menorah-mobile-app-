const express = require('express');
const paymentRoutes = require('./payments');

const router = express.Router();

const delegateToPaymentsRoute = (targetPath) => (req, res, next) => {
  req.url = targetPath;
  return paymentRoutes(req, res, next);
};

router.post('/create-checkout-session', delegateToPaymentsRoute('/create-checkout-session'));
router.post('/booking/create-order', delegateToPaymentsRoute('/create-checkout-session'));
router.post('/create-booking-order', delegateToPaymentsRoute('/create-checkout-session'));

router.post('/verify-razorpay', delegateToPaymentsRoute('/verify-razorpay'));
router.post('/booking/verify', delegateToPaymentsRoute('/verify-razorpay'));
router.post('/verify-booking-payment', delegateToPaymentsRoute('/verify-razorpay'));

router.get('/order/:orderId/status', (req, res, next) => {
  req.url = `/order/${req.params.orderId}/status`;
  return paymentRoutes(req, res, next);
});
router.get('/booking/order/:orderId/status', (req, res, next) => {
  req.url = `/order/${req.params.orderId}/status`;
  return paymentRoutes(req, res, next);
});

router.get('/booking/:bookingId', (req, res, next) => {
  req.url = `/booking/${req.params.bookingId}`;
  return paymentRoutes(req, res, next);
});
router.get('/booking/:bookingId/status', (req, res, next) => {
  req.url = `/booking/${req.params.bookingId}`;
  return paymentRoutes(req, res, next);
});

module.exports = router;
