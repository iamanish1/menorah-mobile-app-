const express = require('express');
const paymentRoutes = require('./payments');

const router = express.Router();

const blockDigitalPayment = (_req, res) =>
  res.status(404).json({
    success: false,
    message: 'Payment route not available for iOS'
  });

const delegateToPaymentsRoute = (targetPath) => (req, res, next) => {
  req.url = targetPath;
  return paymentRoutes(req, res, next);
};

router.post('/booking/create-order', delegateToPaymentsRoute('/create-checkout-session'));
router.post('/create-booking-order', delegateToPaymentsRoute('/create-checkout-session'));
router.post('/booking/verify', delegateToPaymentsRoute('/verify-razorpay'));
router.post('/verify-booking-payment', delegateToPaymentsRoute('/verify-razorpay'));
router.get('/booking/order/:orderId/status', (req, res, next) => {
  req.url = `/order/${req.params.orderId}/status`;
  return paymentRoutes(req, res, next);
});
router.get('/booking/:bookingId/status', (req, res, next) => {
  req.url = `/booking/${req.params.bookingId}`;
  return paymentRoutes(req, res, next);
});

router.post('/create-subscription-checkout', blockDigitalPayment);
router.post('/verify-subscription-payment', blockDigitalPayment);
router.use('/subscription', blockDigitalPayment);
router.use('/premium', blockDigitalPayment);
router.use('/membership', blockDigitalPayment);
router.use('/digital', blockDigitalPayment);
router.use('/digital-access', blockDigitalPayment);
router.use(paymentRoutes);

module.exports = router;
