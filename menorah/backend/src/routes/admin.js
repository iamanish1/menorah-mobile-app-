const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const crypto = require('crypto');
const axios = require('axios');
const User = require('../models/User');
const Counsellor = require('../models/Counsellor');
const Booking = require('../models/Booking');
const { adminAuth, auth } = require('../middleware/auth');

const router = express.Router();

// All routes require auth + admin role
router.use(auth, adminAuth);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const generateSecurePassword = () => {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const special = '@#$!';
  const all = upper + lower + digits + special;
  let password = '';
  password += upper[crypto.randomInt(upper.length)];
  password += lower[crypto.randomInt(lower.length)];
  password += digits[crypto.randomInt(digits.length)];
  password += special[crypto.randomInt(special.length)];
  for (let i = 4; i < 12; i++) {
    password += all[crypto.randomInt(all.length)];
  }
  return password.split('').sort(() => Math.random() - 0.5).join('');
};

const dateRanges = () => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart);
  weekStart.setDate(todayStart.getDate() - todayStart.getDay());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return { todayStart, weekStart, monthStart, now };
};

// ─── Stats ────────────────────────────────────────────────────────────────────

// GET /api/admin/stats
router.get('/stats', async (req, res) => {
  try {
    const { todayStart, weekStart, monthStart, now } = dateRanges();

    const [
      totalUsers,
      totalCounsellors,
      pendingCounsellors,
      approvedCounsellors,
      blockedCounsellors,
      totalBookings,
      activeBookings,
      completedBookings,
      todayBookings,
      totalRevenueResult,
      monthRevenueResult,
      weekRevenueResult,
      todayRevenueResult,
      newUsersToday,
      newUsersThisMonth
    ] = await Promise.all([
      User.countDocuments({ role: 'user' }),
      Counsellor.countDocuments(),
      Counsellor.countDocuments({ status: 'pending' }),
      Counsellor.countDocuments({ status: 'approved' }),
      Counsellor.countDocuments({ isActive: false, status: 'approved' }),
      Booking.countDocuments(),
      Booking.countDocuments({ status: { $in: ['confirmed', 'in-progress'] } }),
      Booking.countDocuments({ status: 'completed' }),
      Booking.countDocuments({ createdAt: { $gte: todayStart } }),
      Booking.aggregate([{ $match: { paymentStatus: 'paid' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Booking.aggregate([{ $match: { paymentStatus: 'paid', createdAt: { $gte: monthStart } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Booking.aggregate([{ $match: { paymentStatus: 'paid', createdAt: { $gte: weekStart } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Booking.aggregate([{ $match: { paymentStatus: 'paid', createdAt: { $gte: todayStart } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      User.countDocuments({ role: 'user', createdAt: { $gte: todayStart } }),
      User.countDocuments({ role: 'user', createdAt: { $gte: monthStart } })
    ]);

    res.json({
      success: true,
      data: {
        users: {
          total: totalUsers,
          newToday: newUsersToday,
          newThisMonth: newUsersThisMonth
        },
        counsellors: {
          total: totalCounsellors,
          pending: pendingCounsellors,
          approved: approvedCounsellors,
          blocked: blockedCounsellors
        },
        bookings: {
          total: totalBookings,
          active: activeBookings,
          completed: completedBookings,
          today: todayBookings
        },
        revenue: {
          total: totalRevenueResult[0]?.total || 0,
          monthly: monthRevenueResult[0]?.total || 0,
          weekly: weekRevenueResult[0]?.total || 0,
          today: todayRevenueResult[0]?.total || 0
        }
      }
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /api/admin/stats/users — daily new user registrations (last 30 days)
router.get('/stats/users', async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [dailyRegistrations, registrationsByRole] = await Promise.all([
      User.aggregate([
        { $match: { createdAt: { $gte: thirtyDaysAgo } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      User.aggregate([
        { $group: { _id: '$role', count: { $sum: 1 } } }
      ])
    ]);

    res.json({
      success: true,
      data: {
        dailyRegistrations: dailyRegistrations.map(d => ({ date: d._id, count: d.count })),
        byRole: registrationsByRole.reduce((acc, r) => { acc[r._id] = r.count; return acc; }, {})
      }
    });
  } catch (error) {
    console.error('Admin user stats error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── Counsellor Management ────────────────────────────────────────────────────

// GET /api/admin/counsellors
router.get('/counsellors', [
  query('status').optional().isIn(['pending', 'approved', 'rejected', 'blocked', 'all']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().isString().trim()
], async (req, res) => {
  try {
    const { status = 'all', page = 1, limit = 20, search } = req.query;

    const counsellorQuery = {};
    if (status === 'blocked') {
      counsellorQuery.isActive = false;
      counsellorQuery.status = 'approved';
    } else if (status !== 'all') {
      counsellorQuery.status = status;
    }

    let userFilter = {};
    if (search) {
      const matchingUsers = await User.find({
        $or: [
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ]
      }).select('_id').lean();
      counsellorQuery.user = { $in: matchingUsers.map(u => u._id) };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [counsellors, total] = await Promise.all([
      Counsellor.find(counsellorQuery)
        .populate('user', 'firstName lastName email phone profileImage isActive createdAt')
        .populate('approvedBy', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Counsellor.countDocuments(counsellorQuery)
    ]);

    // Attach booking acceptance stats to each counsellor
    const counsellorIds = counsellors.map(c => c._id);
    const bookingStats = await Booking.aggregate([
      { $match: { counsellor: { $in: counsellorIds } } },
      { $group: {
        _id: '$counsellor',
        total: { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
        confirmed: { $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, 1, 0] } }
      }}
    ]);
    const statsMap = bookingStats.reduce((acc, s) => {
      acc[s._id.toString()] = s;
      return acc;
    }, {});

    const formatted = counsellors.map(c => ({
      id: c._id,
      user: c.user,
      licenseNumber: c.licenseNumber,
      specialization: c.specialization,
      experience: c.experience,
      hourlyRate: c.hourlyRate,
      currency: c.currency,
      rating: c.rating,
      reviewCount: c.reviewCount,
      status: c.status,
      isActive: c.isActive,
      isVerified: c.isVerified,
      approvedBy: c.approvedBy,
      approvedAt: c.approvedAt,
      rejectionReason: c.rejectionReason,
      blockedAt: c.blockedAt,
      blockedReason: c.blockedReason,
      stats: c.stats,
      bankDetails: c.bankDetails,
      createdAt: c.createdAt,
      bookingStats: statsMap[c._id.toString()] || { total: 0, completed: 0, cancelled: 0, confirmed: 0 }
    }));

    res.json({
      success: true,
      data: {
        counsellors: formatted,
        pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) }
      }
    });
  } catch (error) {
    console.error('Admin get counsellors error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /api/admin/counsellors/:id
router.get('/counsellors/:id', [
  param('id').isMongoId().withMessage('Invalid counsellor ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Invalid ID' });

    const counsellor = await Counsellor.findById(req.params.id)
      .populate('user', 'firstName lastName email phone profileImage isActive createdAt')
      .populate('approvedBy', 'firstName lastName email')
      .lean();

    if (!counsellor) return res.status(404).json({ success: false, message: 'Counsellor not found' });

    // Booking stats (all time + today)
    const { todayStart, weekStart, monthStart } = dateRanges();
    const [allTimeStats, todayStats, weekStats, monthStats] = await Promise.all([
      Booking.aggregate([
        { $match: { counsellor: counsellor._id } },
        { $group: { _id: null, total: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } }, cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } }, revenue: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$amount', 0] } } } }
      ]),
      Booking.aggregate([
        { $match: { counsellor: counsellor._id, createdAt: { $gte: todayStart } } },
        { $group: { _id: null, total: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } }, cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } } } }
      ]),
      Booking.aggregate([
        { $match: { counsellor: counsellor._id, createdAt: { $gte: weekStart } } },
        { $group: { _id: null, total: { $sum: 1 }, revenue: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$amount', 0] } } } }
      ]),
      Booking.aggregate([
        { $match: { counsellor: counsellor._id, createdAt: { $gte: monthStart } } },
        { $group: { _id: null, total: { $sum: 1 }, revenue: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$amount', 0] } } } }
      ])
    ]);

    res.json({
      success: true,
      data: {
        counsellor,
        bookingStats: {
          allTime: allTimeStats[0] || { total: 0, completed: 0, cancelled: 0, revenue: 0 },
          today: todayStats[0] || { total: 0, completed: 0, cancelled: 0 },
          thisWeek: weekStats[0] || { total: 0, revenue: 0 },
          thisMonth: monthStats[0] || { total: 0, revenue: 0 }
        }
      }
    });
  } catch (error) {
    console.error('Admin get counsellor error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// PUT /api/admin/counsellors/:id/approve
// Approves the counsellor AND auto-generates login credentials in one step.
router.put('/counsellors/:id/approve', [
  param('id').isMongoId().withMessage('Invalid counsellor ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Invalid ID' });

    const counsellor = await Counsellor.findById(req.params.id).populate('user');
    if (!counsellor) return res.status(404).json({ success: false, message: 'Counsellor not found' });
    if (counsellor.status === 'approved') return res.status(400).json({ success: false, message: 'Counsellor already approved' });

    const plainPassword = generateSecurePassword();
    const user = await User.findById(counsellor.user._id);
    user.password = plainPassword;
    user.isActive = true;

    user.isEmailVerified = true;
    user.isPhoneVerified = true;

    counsellor.status = 'approved';
    counsellor.isVerified = true;
    counsellor.isActive = true;
    counsellor.isAvailable = true;
    counsellor.approvedBy = req.user._id;
    counsellor.approvedAt = new Date();
    counsellor.rejectionReason = null;

    await Promise.all([user.save(), counsellor.save()]);

    res.json({
      success: true,
      message: 'Counsellor approved. Credentials generated — share them now, the password will not be shown again.',
      data: {
        counsellorId: counsellor._id,
        status: counsellor.status,
        username: user.email,
        password: plainPassword
      }
    });
  } catch (error) {
    console.error('Admin approve counsellor error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// PUT /api/admin/counsellors/:id/reject
router.put('/counsellors/:id/reject', [
  param('id').isMongoId().withMessage('Invalid counsellor ID'),
  body('reason').trim().notEmpty().withMessage('Rejection reason is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const counsellor = await Counsellor.findById(req.params.id).populate('user');
    if (!counsellor) return res.status(404).json({ success: false, message: 'Counsellor not found' });

    counsellor.status = 'rejected';
    counsellor.isVerified = false;
    counsellor.isActive = false;
    counsellor.rejectionReason = req.body.reason;
    await counsellor.save();

    res.json({
      success: true,
      message: 'Counsellor application rejected.',
      data: { counsellorId: counsellor._id, status: counsellor.status }
    });
  } catch (error) {
    console.error('Admin reject counsellor error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// POST /api/admin/counsellors/:id/generate-password
// Generates a new password for the counsellor and activates their account. Returns the plain-text password once.
router.post('/counsellors/:id/generate-password', [
  param('id').isMongoId().withMessage('Invalid counsellor ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Invalid ID' });

    const counsellor = await Counsellor.findById(req.params.id).populate('user');
    if (!counsellor) return res.status(404).json({ success: false, message: 'Counsellor not found' });
    if (counsellor.status !== 'approved') return res.status(400).json({ success: false, message: 'Counsellor must be approved before generating credentials' });

    const plainPassword = generateSecurePassword();
    const user = await User.findById(counsellor.user._id);
    user.password = plainPassword;
    user.isActive = true;
    counsellor.isActive = true;
    counsellor.isAvailable = true;

    await Promise.all([user.save(), counsellor.save()]);

    res.json({
      success: true,
      message: 'Credentials generated. Share these with the counsellor — the password will not be shown again.',
      data: {
        username: user.email,
        password: plainPassword,
        counsellorId: counsellor._id,
        userId: user._id
      }
    });
  } catch (error) {
    console.error('Admin generate password error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// PUT /api/admin/counsellors/:id/block
router.put('/counsellors/:id/block', [
  param('id').isMongoId(),
  body('reason').trim().notEmpty().withMessage('Block reason is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const counsellor = await Counsellor.findById(req.params.id).populate('user');
    if (!counsellor) return res.status(404).json({ success: false, message: 'Counsellor not found' });
    if (!counsellor.isActive) return res.status(400).json({ success: false, message: 'Counsellor is already blocked' });

    counsellor.isActive = false;
    counsellor.isAvailable = false;
    counsellor.blockedAt = new Date();
    counsellor.blockedReason = req.body.reason;

    const user = await User.findById(counsellor.user._id);
    user.isActive = false;

    await Promise.all([counsellor.save(), user.save()]);

    res.json({ success: true, message: 'Counsellor blocked. They cannot receive new bookings or log in.', data: { counsellorId: counsellor._id } });
  } catch (error) {
    console.error('Admin block counsellor error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// PUT /api/admin/counsellors/:id/unblock
router.put('/counsellors/:id/unblock', [
  param('id').isMongoId()
], async (req, res) => {
  try {
    const counsellor = await Counsellor.findById(req.params.id).populate('user');
    if (!counsellor) return res.status(404).json({ success: false, message: 'Counsellor not found' });
    if (counsellor.isActive) return res.status(400).json({ success: false, message: 'Counsellor is not blocked' });

    counsellor.isActive = true;
    counsellor.isAvailable = true;
    counsellor.blockedAt = null;
    counsellor.blockedReason = null;

    const user = await User.findById(counsellor.user._id);
    user.isActive = true;

    await Promise.all([counsellor.save(), user.save()]);

    res.json({ success: true, message: 'Counsellor unblocked. They can now receive bookings.', data: { counsellorId: counsellor._id } });
  } catch (error) {
    console.error('Admin unblock counsellor error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /api/admin/counsellors/:id/booking-stats — daily accept/reject/complete breakdown
router.get('/counsellors/:id/booking-stats', [
  param('id').isMongoId(),
  query('days').optional().isInt({ min: 1, max: 90 })
], async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const counsellor = await Counsellor.findById(req.params.id).lean();
    if (!counsellor) return res.status(404).json({ success: false, message: 'Counsellor not found' });

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const [dailyStats, overallStats] = await Promise.all([
      Booking.aggregate([
        { $match: { counsellor: counsellor._id, createdAt: { $gte: startDate } } },
        { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          total: { $sum: 1 },
          confirmed: { $sum: { $cond: [{ $in: ['$status', ['confirmed', 'in-progress', 'completed']] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          noShow: { $sum: { $cond: [{ $eq: ['$status', 'no-show'] }, 1, 0] } }
        }},
        { $sort: { _id: 1 } }
      ]),
      Booking.aggregate([
        { $match: { counsellor: counsellor._id } },
        { $group: {
          _id: null,
          total: { $sum: 1 },
          confirmed: { $sum: { $cond: [{ $in: ['$status', ['confirmed', 'in-progress', 'completed']] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } }
        }}
      ])
    ]);

    const overall = overallStats[0] || { total: 0, confirmed: 0, cancelled: 0, completed: 0 };
    const acceptRate = overall.total > 0 ? Math.round((overall.confirmed / overall.total) * 100) : 0;
    const cancelRate = overall.total > 0 ? Math.round((overall.cancelled / overall.total) * 100) : 0;

    res.json({
      success: true,
      data: {
        dailyStats: dailyStats.map(d => ({ date: d._id, total: d.total, confirmed: d.confirmed, cancelled: d.cancelled, completed: d.completed, noShow: d.noShow })),
        overall: { ...overall, acceptRate, cancelRate }
      }
    });
  } catch (error) {
    console.error('Admin booking stats error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── User Management ──────────────────────────────────────────────────────────

// GET /api/admin/users
router.get('/users', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().isString().trim(),
  query('role').optional().isIn(['user', 'counsellor', 'admin', 'all'])
], async (req, res) => {
  try {
    const { page = 1, limit = 20, search, role = 'user' } = req.query;
    const userQuery = role !== 'all' ? { role } : {};

    if (search) {
      userQuery.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [users, total] = await Promise.all([
      User.find(userQuery)
        .select('-password -passwordResetToken -passwordResetExpires -emailVerificationToken')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      User.countDocuments(userQuery)
    ]);

    // Attach booking count per user
    const userIds = users.map(u => u._id);
    const bookingCounts = await Booking.aggregate([
      { $match: { user: { $in: userIds } } },
      { $group: { _id: '$user', count: { $sum: 1 } } }
    ]);
    const bookingMap = bookingCounts.reduce((acc, b) => { acc[b._id.toString()] = b.count; return acc; }, {});

    res.json({
      success: true,
      data: {
        users: users.map(u => ({ ...u, bookingCount: bookingMap[u._id.toString()] || 0 })),
        pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) }
      }
    });
  } catch (error) {
    console.error('Admin get users error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── Revenue Management ───────────────────────────────────────────────────────

// GET /api/admin/revenue — Platform-level revenue breakdown
router.get('/revenue', [
  query('period').optional().isIn(['daily', 'weekly', 'monthly', 'yearly'])
], async (req, res) => {
  try {
    const { todayStart, weekStart, monthStart } = dateRanges();
    const yearStart = new Date(new Date().getFullYear(), 0, 1);

    const [daily, weekly, monthly, yearly, totalRevenue, dailyTrend, monthlyTrend] = await Promise.all([
      Booking.aggregate([{ $match: { paymentStatus: 'paid', createdAt: { $gte: todayStart } } }, { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
      Booking.aggregate([{ $match: { paymentStatus: 'paid', createdAt: { $gte: weekStart } } }, { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
      Booking.aggregate([{ $match: { paymentStatus: 'paid', createdAt: { $gte: monthStart } } }, { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
      Booking.aggregate([{ $match: { paymentStatus: 'paid', createdAt: { $gte: yearStart } } }, { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
      Booking.aggregate([{ $match: { paymentStatus: 'paid' } }, { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
      // Last 30 days daily trend
      Booking.aggregate([
        { $match: { paymentStatus: 'paid', createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, revenue: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      // Last 12 months monthly trend
      Booking.aggregate([
        { $match: { paymentStatus: 'paid', createdAt: { $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, revenue: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ])
    ]);

    res.json({
      success: true,
      data: {
        summary: {
          today: { revenue: daily[0]?.total || 0, bookings: daily[0]?.count || 0 },
          weekly: { revenue: weekly[0]?.total || 0, bookings: weekly[0]?.count || 0 },
          monthly: { revenue: monthly[0]?.total || 0, bookings: monthly[0]?.count || 0 },
          yearly: { revenue: yearly[0]?.total || 0, bookings: yearly[0]?.count || 0 },
          allTime: { revenue: totalRevenue[0]?.total || 0, bookings: totalRevenue[0]?.count || 0 }
        },
        dailyTrend: dailyTrend.map(d => ({ date: d._id, revenue: d.revenue, bookings: d.count })),
        monthlyTrend: monthlyTrend.map(m => ({ month: m._id, revenue: m.revenue, bookings: m.count }))
      }
    });
  } catch (error) {
    console.error('Admin revenue error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /api/admin/revenue/counsellors — Revenue per counsellor (paginated)
router.get('/revenue/counsellors', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('period').optional().isIn(['today', 'weekly', 'monthly', 'allTime'])
], async (req, res) => {
  try {
    const { page = 1, limit = 20, period = 'monthly' } = req.query;
    const { todayStart, weekStart, monthStart } = dateRanges();

    const periodFilter = {
      today: todayStart,
      weekly: weekStart,
      monthly: monthStart,
      allTime: new Date(0)
    }[period];

    const revenueData = await Booking.aggregate([
      { $match: { paymentStatus: 'paid', counsellor: { $ne: null }, createdAt: { $gte: periodFilter } } },
      { $group: {
        _id: '$counsellor',
        revenue: { $sum: '$amount' },
        sessions: { $sum: 1 }
      }},
      { $sort: { revenue: -1 } },
      { $skip: (parseInt(page) - 1) * parseInt(limit) },
      { $limit: parseInt(limit) },
      { $lookup: {
        from: 'counsellors',
        localField: '_id',
        foreignField: '_id',
        as: 'counsellor'
      }},
      { $unwind: '$counsellor' },
      { $lookup: {
        from: 'users',
        localField: 'counsellor.user',
        foreignField: '_id',
        as: 'user'
      }},
      { $unwind: '$user' }
    ]);

    const totalCount = await Booking.distinct('counsellor', {
      paymentStatus: 'paid',
      counsellor: { $ne: null },
      createdAt: { $gte: periodFilter }
    });

    res.json({
      success: true,
      data: {
        counsellors: revenueData.map(r => ({
          counsellorId: r._id,
          userId: r.user._id,
          name: `${r.user.firstName} ${r.user.lastName}`,
          email: r.user.email,
          specialization: r.counsellor.specialization,
          revenue: r.revenue,
          sessions: r.sessions,
          commissionRate: r.counsellor.commissionRate,
          counsellorEarnings: Math.round(r.revenue * (1 - r.counsellor.commissionRate / 100)),
          platformFee: Math.round(r.revenue * (r.counsellor.commissionRate / 100)),
          bankDetails: r.counsellor.bankDetails,
          lastPayoutAt: r.counsellor.lastPayoutAt,
          lastPayoutAmount: r.counsellor.lastPayoutAmount,
          totalPaidOut: r.counsellor.totalPaidOut,
          razorpayContactId: r.counsellor.razorpayContactId,
          razorpayFundAccountId: r.counsellor.razorpayFundAccountId
        })),
        pagination: { page: parseInt(page), limit: parseInt(limit), total: totalCount.length, pages: Math.ceil(totalCount.length / parseInt(limit)) }
      }
    });
  } catch (error) {
    console.error('Admin counsellor revenue error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /api/admin/revenue/counsellors/:id — Specific counsellor revenue detail
router.get('/revenue/counsellors/:id', [
  param('id').isMongoId()
], async (req, res) => {
  try {
    const counsellor = await Counsellor.findById(req.params.id).populate('user', 'firstName lastName email phone').lean();
    if (!counsellor) return res.status(404).json({ success: false, message: 'Counsellor not found' });

    const { todayStart, weekStart, monthStart } = dateRanges();

    const [allTimePeriod, monthPeriod, weekPeriod, todayPeriod, monthlyBreakdown] = await Promise.all([
      Booking.aggregate([
        { $match: { counsellor: counsellor._id, paymentStatus: 'paid' } },
        { $group: { _id: null, revenue: { $sum: '$amount' }, sessions: { $sum: 1 } } }
      ]),
      Booking.aggregate([
        { $match: { counsellor: counsellor._id, paymentStatus: 'paid', createdAt: { $gte: monthStart } } },
        { $group: { _id: null, revenue: { $sum: '$amount' }, sessions: { $sum: 1 } } }
      ]),
      Booking.aggregate([
        { $match: { counsellor: counsellor._id, paymentStatus: 'paid', createdAt: { $gte: weekStart } } },
        { $group: { _id: null, revenue: { $sum: '$amount' }, sessions: { $sum: 1 } } }
      ]),
      Booking.aggregate([
        { $match: { counsellor: counsellor._id, paymentStatus: 'paid', createdAt: { $gte: todayStart } } },
        { $group: { _id: null, revenue: { $sum: '$amount' }, sessions: { $sum: 1 } } }
      ]),
      Booking.aggregate([
        { $match: { counsellor: counsellor._id, paymentStatus: 'paid' } },
        { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, revenue: { $sum: '$amount' }, sessions: { $sum: 1 } } },
        { $sort: { _id: -1 } },
        { $limit: 12 }
      ])
    ]);

    const calcEarnings = (rev) => ({
      gross: rev,
      counsellorNet: Math.round(rev * (1 - counsellor.commissionRate / 100)),
      platformFee: Math.round(rev * (counsellor.commissionRate / 100))
    });

    res.json({
      success: true,
      data: {
        counsellor: {
          id: counsellor._id,
          name: `${counsellor.user.firstName} ${counsellor.user.lastName}`,
          email: counsellor.user.email,
          phone: counsellor.user.phone,
          specialization: counsellor.specialization,
          commissionRate: counsellor.commissionRate,
          bankDetails: counsellor.bankDetails,
          lastPayoutAt: counsellor.lastPayoutAt,
          lastPayoutAmount: counsellor.lastPayoutAmount,
          totalPaidOut: counsellor.totalPaidOut,
          razorpayContactId: counsellor.razorpayContactId,
          razorpayFundAccountId: counsellor.razorpayFundAccountId
        },
        revenue: {
          allTime: { ...calcEarnings(allTimePeriod[0]?.revenue || 0), sessions: allTimePeriod[0]?.sessions || 0 },
          monthly: { ...calcEarnings(monthPeriod[0]?.revenue || 0), sessions: monthPeriod[0]?.sessions || 0 },
          weekly: { ...calcEarnings(weekPeriod[0]?.revenue || 0), sessions: weekPeriod[0]?.sessions || 0 },
          today: { ...calcEarnings(todayPeriod[0]?.revenue || 0), sessions: todayPeriod[0]?.sessions || 0 }
        },
        monthlyBreakdown: monthlyBreakdown.map(m => ({
          month: m._id,
          revenue: m.revenue,
          sessions: m.sessions,
          counsellorNet: Math.round(m.revenue * (1 - counsellor.commissionRate / 100))
        }))
      }
    });
  } catch (error) {
    console.error('Admin counsellor revenue detail error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── Payouts ──────────────────────────────────────────────────────────────────

// POST /api/admin/payouts/:counsellorId — Initiate Razorpay X payout
router.post('/payouts/:counsellorId', [
  param('counsellorId').isMongoId(),
  body('amount').isInt({ min: 100 }).withMessage('Amount must be at least ₹1 (100 paise)'),
  body('notes').optional().isString().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const counsellor = await Counsellor.findById(req.params.counsellorId).populate('user', 'firstName lastName email phone').lean();
    if (!counsellor) return res.status(404).json({ success: false, message: 'Counsellor not found' });

    if (!counsellor.bankDetails?.accountNumber || !counsellor.bankDetails?.ifscCode) {
      return res.status(400).json({ success: false, message: 'Counsellor does not have bank details on file. Please update their profile first.' });
    }

    const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
    const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
    const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');
    const headers = { 'Content-Type': 'application/json', 'Authorization': `Basic ${auth}` };

    let contactId = counsellor.razorpayContactId;
    let fundAccountId = counsellor.razorpayFundAccountId;

    // Step 1: Create or reuse Razorpay Contact
    if (!contactId) {
      const contactRes = await axios.post('https://api.razorpay.com/v1/contacts', {
        name: `${counsellor.user.firstName} ${counsellor.user.lastName}`,
        email: counsellor.user.email,
        contact: counsellor.user.phone,
        type: 'vendor',
        reference_id: counsellor._id.toString()
      }, { headers });
      contactId = contactRes.data.id;
      await Counsellor.findByIdAndUpdate(counsellor._id, { razorpayContactId: contactId });
    }

    // Step 2: Create or reuse Fund Account
    if (!fundAccountId) {
      const fundRes = await axios.post('https://api.razorpay.com/v1/fund_accounts', {
        contact_id: contactId,
        account_type: 'bank_account',
        bank_account: {
          name: counsellor.bankDetails.accountHolderName || `${counsellor.user.firstName} ${counsellor.user.lastName}`,
          ifsc: counsellor.bankDetails.ifscCode,
          account_number: counsellor.bankDetails.accountNumber
        }
      }, { headers });
      fundAccountId = fundRes.data.id;
      await Counsellor.findByIdAndUpdate(counsellor._id, { razorpayFundAccountId: fundAccountId });
    }

    // Step 3: Create Payout
    const payoutRes = await axios.post('https://api.razorpay.com/v1/payouts', {
      account_number: process.env.RAZORPAY_PAYOUT_ACCOUNT_NUMBER,
      fund_account_id: fundAccountId,
      amount: req.body.amount,
      currency: 'INR',
      mode: 'IMPS',
      purpose: 'payout',
      queue_if_low_balance: true,
      reference_id: `menorah_payout_${counsellor._id}_${Date.now()}`,
      narration: `Menorah Health counsellor payout`,
      notes: { counsellorId: counsellor._id.toString(), notes: req.body.notes || '' }
    }, { headers });

    const amountInRupees = req.body.amount / 100;
    await Counsellor.findByIdAndUpdate(counsellor._id, {
      lastPayoutAt: new Date(),
      lastPayoutAmount: amountInRupees,
      $inc: { totalPaidOut: amountInRupees }
    });

    res.json({
      success: true,
      message: `Payout of ₹${amountInRupees} initiated successfully.`,
      data: {
        payoutId: payoutRes.data.id,
        status: payoutRes.data.status,
        amount: amountInRupees,
        counsellorId: counsellor._id,
        fundAccountId
      }
    });
  } catch (error) {
    const razorpayError = error.response?.data;
    console.error('Admin payout error:', razorpayError || error.message);
    res.status(500).json({
      success: false,
      message: razorpayError?.error?.description || 'Payout failed. Please check Razorpay X is activated on your account.',
      error: razorpayError
    });
  }
});

module.exports = router;
