const express = require('express');
const paymentRoutes = require('./payments');

const router = express.Router();

const blockDigitalPayment = (_req, res) =>
  res.status(404).json({
    success: false,
    message: 'Payment route not available for iOS'
  });

router.post('/create-subscription-checkout', blockDigitalPayment);
router.post('/verify-subscription-payment', blockDigitalPayment);
router.get('/subscription/status', blockDigitalPayment);
router.use(paymentRoutes);

module.exports = router;
