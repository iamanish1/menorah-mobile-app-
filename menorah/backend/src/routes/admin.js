const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const axios = require('axios');
const User = require('../models/User');
const Counsellor = require('../models/Counsellor');
const Booking = require('../models/Booking');
const PendingApplication = require('../models/PendingApplication');
const KycVerification = require('../models/KycVerification');
const { adminAuth, auth } = require('../middleware/auth');
const {
  isAllowedExternalProvider,
  isSafeHttpsUrl,
  normalizeProvider,
  providerDisplayName,
  resolveCallPolicy
} = require('../services/callPolicyService');

const router = express.Router();

// All routes require auth + admin role
router.use(auth, adminAuth);

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Escapes all special regex metacharacters so user-supplied search strings
// cannot be used to craft catastrophic backtracking (ReDoS) patterns.
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const formatVideoCall = (videoCall = {}) => ({
  provider: videoCall.provider,
  joinMode: videoCall.joinMode,
  externalProviderName: videoCall.externalProviderName,
  externalJoinUrl: videoCall.externalJoinUrl,
  externalHostUrl: videoCall.externalHostUrl,
  region: videoCall.region,
  status: videoCall.status,
  policyReason: videoCall.policyReason,
  lastPolicyCheckAt: videoCall.lastPolicyCheckAt,
  configuredAt: videoCall.configuredAt
});

const formatAdminBooking = (booking) => ({
  id: booking._id,
  user: booking.user || null,
  userName: booking.user ? `${booking.user.firstName} ${booking.user.lastName}` : 'Unknown user',
  userEmail: booking.user?.email || '',
  userPhone: booking.user?.phone || '',
  counsellor: booking.counsellor || null,
  counsellorName: booking.counsellor?.user
    ? `${booking.counsellor.user.firstName} ${booking.counsellor.user.lastName}`
    : 'Unassigned',
  sessionType: booking.sessionType,
  sessionDuration: booking.sessionDuration,
  scheduledAt: booking.scheduledAt,
  status: booking.status,
  paymentStatus: booking.paymentStatus,
  videoCall: formatVideoCall(booking.videoCall),
  createdAt: booking.createdAt
});

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

const bytes = (value) => Number.isFinite(value) ? value : 0;

const readProcStat = () => {
  const line = fs.readFileSync('/proc/stat', 'utf8').split('\n')[0];
  const parts = line.trim().split(/\s+/).slice(1).map(Number);
  const [user = 0, nice = 0, system = 0, idle = 0, iowait = 0, irq = 0, softirq = 0, steal = 0] = parts;
  const idleAll = idle + iowait;
  const nonIdle = user + nice + system + irq + softirq + steal;
  return { idle: idleAll, total: idleAll + nonIdle };
};

const getCpuSample = () => new Promise((resolve) => {
  try {
    const start = readProcStat();
    setTimeout(() => {
      try {
        const end = readProcStat();
        const totalDiff = end.total - start.total;
        const idleDiff = end.idle - start.idle;
        const usagePercent = totalDiff > 0 ? Math.max(0, Math.min(100, (1 - idleDiff / totalDiff) * 100)) : 0;
        resolve(usagePercent);
      } catch {
        resolve(0);
      }
    }, 250);
  } catch {
    resolve(0);
  }
});

const getDiskUsage = (targetPath) => {
  try {
    const stats = fs.statfsSync(targetPath);
    const total = bytes(stats.blocks * stats.bsize);
    const free = bytes(stats.bavail * stats.bsize);
    const used = Math.max(0, total - free);
    return {
      path: targetPath,
      total,
      used,
      free,
      usagePercent: total > 0 ? Math.round((used / total) * 1000) / 10 : 0
    };
  } catch {
    return { path: targetPath, total: 0, used: 0, free: 0, usagePercent: 0 };
  }
};

const readNumberFile = (filePath) => {
  try {
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (raw === 'max') return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
};

const getCgroupMemory = () => {
  const current = readNumberFile('/sys/fs/cgroup/memory.current');
  const max = readNumberFile('/sys/fs/cgroup/memory.max');
  if (current === null) return null;
  return {
    current,
    max,
    usagePercent: max ? Math.round((current / max) * 1000) / 10 : null
  };
};

const getNetworkStats = () => {
  try {
    const lines = fs.readFileSync('/proc/net/dev', 'utf8').trim().split('\n').slice(2);
    return lines.reduce((acc, line) => {
      const [ifacePart, dataPart] = line.split(':');
      const iface = ifacePart.trim();
      if (!iface || iface === 'lo') return acc;
      const values = dataPart.trim().split(/\s+/).map(Number);
      acc.rxBytes += bytes(values[0]);
      acc.txBytes += bytes(values[8]);
      return acc;
    }, { rxBytes: 0, txBytes: 0 });
  } catch {
    return { rxBytes: 0, txBytes: 0 };
  }
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
      newUsersThisMonth,
      pendingKycReviews,
      verifiedKycUsers,
      rejectedKycUsers
    ] = await Promise.all([
      User.countDocuments({ role: 'user' }),
      Counsellor.countDocuments(),
      PendingApplication.countDocuments({ status: 'pending' }),
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
      User.countDocuments({ role: 'user', createdAt: { $gte: monthStart } }),
      KycVerification.countDocuments({ status: 'manual_review' }),
      User.countDocuments({ role: 'user', 'kyc.status': 'verified' }),
      KycVerification.countDocuments({ status: 'rejected' })
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
        },
        kyc: {
          pendingReview: pendingKycReviews,
          verified: verifiedKycUsers,
          rejected: rejectedKycUsers
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

// GET /api/admin/server-usage — live server/container resource telemetry
router.get('/server-usage', async (_req, res) => {
  try {
    const cpuUsagePercent = await getCpuSample();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = Math.max(0, totalMemory - freeMemory);
    const rootDisk = getDiskUsage('/');
    const uploadPath = path.resolve(process.cwd(), process.env.UPLOAD_PATH || './uploads');
    const uploadDisk = getDiskUsage(uploadPath);
    const cgroupMemory = getCgroupMemory();
    const network = getNetworkStats();

    res.json({
      success: true,
      data: {
        sampledAt: new Date().toISOString(),
        host: {
          hostname: os.hostname(),
          platform: os.platform(),
          release: os.release(),
          uptimeSeconds: Math.round(os.uptime())
        },
        cpu: {
          usagePercent: Math.round(cpuUsagePercent * 10) / 10,
          loadAverage: os.loadavg()
        },
        memory: {
          total: totalMemory,
          used: usedMemory,
          free: freeMemory,
          usagePercent: totalMemory > 0 ? Math.round((usedMemory / totalMemory) * 1000) / 10 : 0
        },
        container: {
          memory: cgroupMemory
        },
        disk: {
          root: rootDisk,
          uploads: uploadDisk
        },
        network,
        process: {
          pid: process.pid,
          uptimeSeconds: Math.round(process.uptime()),
          memory: process.memoryUsage()
        }
      }
    });
  } catch (error) {
    console.error('Admin server usage error:', error);
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
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Pending tab — served from PendingApplication collection
    if (status === 'pending') {
      const searchQuery = search
        ? { $or: [
            { firstName: { $regex: escapeRegex(search), $options: 'i' } },
            { lastName: { $regex: escapeRegex(search), $options: 'i' } },
            { email: { $regex: escapeRegex(search), $options: 'i' } }
          ]}
        : {};
      searchQuery.status = 'pending';

      const [apps, total] = await Promise.all([
        PendingApplication.find(searchQuery).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
        PendingApplication.countDocuments(searchQuery)
      ]);

      const formatted = apps.map(a => ({
        id: a._id,
        isPendingApplication: true,
        user: { firstName: a.firstName, lastName: a.lastName, email: a.email, phone: a.phone, isActive: false, createdAt: a.createdAt },
        licenseNumber: a.licenseNumber,
        specialization: a.specialization,
        experience: a.experience,
        hourlyRate: a.hourlyRate,
        currency: a.currency,
        status: 'pending',
        isActive: false,
        isVerified: false,
        createdAt: a.createdAt,
        bookingStats: { total: 0, completed: 0, cancelled: 0, confirmed: 0 }
      }));

      return res.json({
        success: true,
        data: { counsellors: formatted, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) } }
      });
    }

    // Rejected tab — served from PendingApplication collection (same as pending)
    if (status === 'rejected') {
      const searchQuery = search
        ? { $or: [
            { firstName: { $regex: escapeRegex(search), $options: 'i' } },
            { lastName: { $regex: escapeRegex(search), $options: 'i' } },
            { email: { $regex: escapeRegex(search), $options: 'i' } }
          ]}
        : {};
      searchQuery.status = 'rejected';

      const [apps, total] = await Promise.all([
        PendingApplication.find(searchQuery).sort({ reviewedAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
        PendingApplication.countDocuments(searchQuery)
      ]);

      const formatted = apps.map(a => ({
        id: a._id,
        isPendingApplication: true,
        user: { firstName: a.firstName, lastName: a.lastName, email: a.email, phone: a.phone, isActive: false, createdAt: a.createdAt },
        licenseNumber: a.licenseNumber,
        specialization: a.specialization,
        experience: a.experience,
        hourlyRate: a.hourlyRate,
        currency: a.currency,
        status: 'rejected',
        isActive: false,
        isVerified: false,
        rejectionReason: a.rejectionReason,
        createdAt: a.createdAt,
        bookingStats: { total: 0, completed: 0, cancelled: 0, confirmed: 0 }
      }));

      return res.json({
        success: true,
        data: { counsellors: formatted, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) } }
      });
    }

    // All other tabs (approved, blocked, all) — served from Counsellor collection
    const counsellorQuery = {};
    if (status === 'blocked') {
      counsellorQuery.isActive = false;
      counsellorQuery.status = 'approved';
    } else if (status !== 'all') {
      counsellorQuery.status = status;
    }

    if (search) {
      const matchingUsers = await User.find({
        $or: [
          { firstName: { $regex: escapeRegex(search), $options: 'i' } },
          { lastName: { $regex: escapeRegex(search), $options: 'i' } },
          { email: { $regex: escapeRegex(search), $options: 'i' } }
        ]
      }).select('_id').lean();
      counsellorQuery.user = { $in: matchingUsers.map(u => u._id) };
    }

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

    const counsellorIds = counsellors.map(c => c._id);
    const bookingStats = await Booking.aggregate([
      { $match: { counsellor: { $in: counsellorIds } } },
      { $group: { _id: '$counsellor', total: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } }, cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } }, confirmed: { $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, 1, 0] } } } }
    ]);
    const statsMap = bookingStats.reduce((acc, s) => { acc[s._id.toString()] = s; return acc; }, {});

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
      data: { counsellors: formatted, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) } }
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
// Creates User + Counsellor from PendingApplication, generates credentials, deletes pending record.
router.put('/counsellors/:id/approve', [
  param('id').isMongoId().withMessage('Invalid ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Invalid ID' });

    const application = await PendingApplication.findById(req.params.id);
    if (!application) return res.status(404).json({ success: false, message: 'Application not found' });
    if (application.status !== 'pending') return res.status(400).json({ success: false, message: 'Application is not pending' });

    const [existingByEmail, existingByPhone, existingLicense] = await Promise.all([
      User.findOne({ email: application.email }),
      User.findOne({ phone: application.phone }),
      Counsellor.findOne({ licenseNumber: application.licenseNumber })
    ]);

    if (existingByEmail && existingByPhone && existingByEmail._id.toString() !== existingByPhone._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'This application email and phone belong to different existing users. Use a unique test phone/email or review manually.'
      });
    }

    if (existingLicense) {
      return res.status(400).json({
        success: false,
        message: 'A counsellor with this license number already exists.'
      });
    }

    const existingUser = existingByEmail || existingByPhone;
    if (existingUser) {
      const existingCounsellor = await Counsellor.findOne({ user: existingUser._id });
      if (existingCounsellor) {
        return res.status(400).json({
          success: false,
          message: 'This user already has a counsellor profile.'
        });
      }
    }

    const plainPassword = generateSecurePassword();

    const user = existingUser || new User();
    user.firstName = application.firstName || user.firstName;
    user.lastName = application.lastName || user.lastName;
    user.email = application.email || user.email;
    user.phone = application.phone || user.phone;
    user.password = plainPassword;
    user.dateOfBirth = application.dateOfBirth || user.dateOfBirth;
    user.gender = application.gender || user.gender || 'male';
    user.role = 'counsellor';
    user.isActive = true;
    user.isEmailVerified = true;
    user.isPhoneVerified = true;
    await user.save();

    const counsellor = new Counsellor({
      user: user._id,
      licenseNumber: application.licenseNumber,
      specialization: application.specialization,
      specializations: application.specializations?.length ? application.specializations : [application.specialization],
      experience: application.experience,
      bio: application.bio,
      languages: application.languages,
      hourlyRate: application.hourlyRate,
      currency: application.currency || 'INR',
      education: application.education || [],
      certifications: application.certifications || [],
      availability: application.availability,
      status: 'approved',
      isVerified: true,
      isActive: true,
      isAvailable: true,
      approvedBy: req.user._id,
      approvedAt: new Date(),
    });
    await counsellor.save();

    await PendingApplication.findByIdAndDelete(application._id);

    res.json({
      success: true,
      message: 'Counsellor approved. Credentials generated — share them now, the password will not be shown again.',
      data: { counsellorId: counsellor._id, status: 'approved', username: user.email, password: plainPassword }
    });
  } catch (error) {
    console.error('Admin approve counsellor error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// PUT /api/admin/counsellors/:id/reject
// Marks PendingApplication as rejected — no User/Counsellor records to clean up.
router.put('/counsellors/:id/reject', [
  param('id').isMongoId().withMessage('Invalid ID'),
  body('reason').trim().notEmpty().withMessage('Rejection reason is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const application = await PendingApplication.findById(req.params.id);
    if (!application) return res.status(404).json({ success: false, message: 'Application not found' });

    application.status = 'rejected';
    application.rejectionReason = req.body.reason;
    application.reviewedBy = req.user._id;
    application.reviewedAt = new Date();
    await application.save();

    res.json({
      success: true,
      message: 'Application rejected.',
      data: { applicationId: application._id, status: 'rejected' }
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
        { firstName: { $regex: escapeRegex(search), $options: 'i' } },
        { lastName: { $regex: escapeRegex(search), $options: 'i' } },
        { email: { $regex: escapeRegex(search), $options: 'i' } },
        { phone: { $regex: escapeRegex(search), $options: 'i' } }
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

// ─── Payouts ─────────────────────────────────────────────────────────────────

const Payout = require('../models/Payout');

// SMS helper — notify counsellor of payout status
async function sendPayoutSms(phone, firstName, amountRupees, payoutId, status) {
  const key = process.env.MSG91_AUTH_KEY;
  if (!key || !phone) return;
  try {
    const message = status === 'initiated'
      ? `Dear ${firstName}, a payout of Rs.${amountRupees} has been initiated by Menorah Health. ID: ${payoutId}. Expected within 1-2 business days.`
      : `Dear ${firstName}, your payout of Rs.${amountRupees} was processed successfully. ID: ${payoutId}. Thank you - Menorah Health.`;
    await axios.post('https://api.msg91.com/api/sendhttp.php', null, {
      params: { authkey: key, mobiles: phone.replace(/^\+/, ''), message, sender: 'MENRH', route: 4 }
    });
  } catch (err) {
    console.error('Payout SMS notification error:', err.message);
  }
}

// POST /api/admin/payouts/:counsellorId — Initiate payout
router.post('/payouts/:counsellorId', [
  param('counsellorId').isMongoId(),
  body('amount').isInt({ min: 100 }).withMessage('Amount must be at least ₹1 (100 paise)'),
  body('notes').optional().isString().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const counsellor = await Counsellor.findById(req.params.counsellorId)
      .populate('user', 'firstName lastName email phone').lean();
    if (!counsellor) return res.status(404).json({ success: false, message: 'Counsellor not found' });

    if (!counsellor.bankDetails?.accountNumber || !counsellor.bankDetails?.ifscCode) {
      return res.status(400).json({ success: false, message: 'Counsellor has no bank details on file.' });
    }

    // ── Idempotency: block if a payout is already in-flight ──────────────────
    const inFlight = await Payout.findOne({
      counsellor: counsellor._id,
      status: { $in: ['processing', 'queued', 'pending', 'on_hold'] }
    }).lean();
    if (inFlight) {
      return res.status(409).json({
        success: false,
        message: `A payout of ₹${inFlight.amountRupees} is already ${inFlight.status} (ID: ${inFlight.razorpayPayoutId}). Wait for it to complete before initiating another.`,
        data: { existingPayoutId: inFlight.razorpayPayoutId, status: inFlight.status }
      });
    }

    // ── Razorpay X credentials ────────────────────────────────────────────────
    const RZP_KEY    = process.env.RAZORPAY_X_KEY_ID    || process.env.RAZORPAY_KEY_ID;
    const RZP_SECRET = process.env.RAZORPAY_X_KEY_SECRET || process.env.RAZORPAY_KEY_SECRET;
    if (!RZP_KEY || !RZP_SECRET) {
      return res.status(500).json({ success: false, message: 'Razorpay credentials not configured.' });
    }
    if (!process.env.RAZORPAY_PAYOUT_ACCOUNT_NUMBER) {
      return res.status(500).json({ success: false, message: 'RAZORPAY_PAYOUT_ACCOUNT_NUMBER not configured.' });
    }

    const rzpAuth = Buffer.from(`${RZP_KEY}:${RZP_SECRET}`).toString('base64');
    const headers = { 'Content-Type': 'application/json', 'Authorization': `Basic ${rzpAuth}` };

    let contactId     = counsellor.razorpayContactId;
    let fundAccountId = counsellor.razorpayFundAccountId;

    // Step 1: Create or reuse Razorpay Contact
    if (!contactId) {
      const res1 = await axios.post('https://api.razorpay.com/v1/contacts', {
        name: `${counsellor.user.firstName} ${counsellor.user.lastName}`,
        email: counsellor.user.email,
        contact: counsellor.user.phone,
        type: 'vendor',
        reference_id: counsellor._id.toString()
      }, { headers });
      contactId = res1.data.id;
      await Counsellor.findByIdAndUpdate(counsellor._id, { razorpayContactId: contactId });
    }

    // Step 2: Create or reuse Fund Account
    if (!fundAccountId) {
      const res2 = await axios.post('https://api.razorpay.com/v1/fund_accounts', {
        contact_id: contactId,
        account_type: 'bank_account',
        bank_account: {
          name: counsellor.bankDetails.accountHolderName || `${counsellor.user.firstName} ${counsellor.user.lastName}`,
          ifsc: counsellor.bankDetails.ifscCode,
          account_number: counsellor.bankDetails.accountNumber
        }
      }, { headers });
      fundAccountId = res2.data.id;
      await Counsellor.findByIdAndUpdate(counsellor._id, { razorpayFundAccountId: fundAccountId });
    }

    // Step 3: Initiate Razorpay Payout
    const referenceId = `menorah_payout_${counsellor._id}_${Date.now()}`;
    const payoutRes = await axios.post('https://api.razorpay.com/v1/payouts', {
      account_number:      process.env.RAZORPAY_PAYOUT_ACCOUNT_NUMBER,
      fund_account_id:     fundAccountId,
      amount:              req.body.amount,
      currency:            'INR',
      mode:                'IMPS',
      purpose:             'payout',
      queue_if_low_balance: true,
      reference_id:        referenceId,
      narration:           'Menorah Health counsellor payout',
      notes: { counsellorId: counsellor._id.toString(), adminNotes: req.body.notes || '' }
    }, { headers });

    const amountRupees = req.body.amount / 100;

    // Step 4: Persist payout record
    const payoutRecord = await Payout.create({
      counsellor:        counsellor._id,
      initiatedBy:       req.user._id,
      amountPaise:       req.body.amount,
      amountRupees,
      razorpayPayoutId:      payoutRes.data.id,
      razorpayFundAccountId: fundAccountId,
      razorpayContactId:     contactId,
      referenceId,
      status: payoutRes.data.status || 'processing',
      bankDetailsSnapshot: {
        accountNumberMasked: '···' + counsellor.bankDetails.accountNumber.slice(-4),
        ifscCode:            counsellor.bankDetails.ifscCode,
        accountHolderName:   counsellor.bankDetails.accountHolderName,
        bankName:            counsellor.bankDetails.bankName
      },
      notes: req.body.notes || ''
    });

    // Step 5: Update counsellor payout stats
    await Counsellor.findByIdAndUpdate(counsellor._id, {
      lastPayoutAt:     new Date(),
      lastPayoutAmount: amountRupees,
      $inc: { totalPaidOut: amountRupees }
    });

    // Step 6: SMS notification to counsellor
    await sendPayoutSms(counsellor.user.phone, counsellor.user.firstName, amountRupees, payoutRes.data.id, 'initiated');

    res.json({
      success: true,
      message: `Payout of ₹${amountRupees} initiated successfully.`,
      data: {
        payoutId:       payoutRes.data.id,
        payoutRecordId: payoutRecord._id,
        status:         payoutRes.data.status,
        amount:         amountRupees,
        counsellorId:   counsellor._id,
        fundAccountId
      }
    });
  } catch (error) {
    const rzpErr = error.response?.data;
    console.error('Admin payout error:', rzpErr || error.message);
    res.status(500).json({
      success: false,
      message: rzpErr?.error?.description || 'Payout failed. Please verify Razorpay X is activated and credentials are correct.'
    });
  }
});

// GET /api/admin/payouts — list all payouts with pagination + filtering
router.get('/payouts', async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(50, parseInt(req.query.limit) || 20);
    const skip   = (page - 1) * limit;
    const filter = {};

    if (req.query.status)       filter.status = req.query.status;
    if (req.query.counsellorId?.match(/^[0-9a-fA-F]{24}$/)) {
      filter.counsellor = req.query.counsellorId;
    }

    const [payouts, total] = await Promise.all([
      Payout.find(filter)
        .populate({
          path: 'counsellor',
          select: 'bankDetails',
          populate: { path: 'user', select: 'firstName lastName email' }
        })
        .populate('initiatedBy', 'firstName lastName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Payout.countDocuments(filter)
    ]);

    res.json({
      success: true,
      data: {
        payouts,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) }
      }
    });
  } catch (error) {
    console.error('Get payouts error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /api/admin/payouts/counsellor/:counsellorId — payouts for one counsellor
router.get('/payouts/counsellor/:counsellorId', [
  param('counsellorId').isMongoId()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const payouts = await Payout.find({ counsellor: req.params.counsellorId })
      .populate('initiatedBy', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const summary = {
      total:        payouts.length,
      totalPaid:    payouts.filter(p => p.status === 'processed').reduce((s, p) => s + p.amountRupees, 0),
      totalPending: payouts.filter(p => ['processing','queued','pending','on_hold'].includes(p.status)).reduce((s, p) => s + p.amountRupees, 0),
      totalFailed:  payouts.filter(p => ['failed','reversed','cancelled'].includes(p.status)).reduce((s, p) => s + p.amountRupees, 0)
    };

    res.json({ success: true, data: { payouts, summary } });
  } catch (error) {
    console.error('Get counsellor payouts error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /api/admin/ekyc/reviews — list identity verification review records
router.get('/ekyc/reviews', [
  query('status').optional().isIn(['manual_review', 'verified', 'rejected', 'pending', 'all']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 20);
    const filter = {};
    if (req.query.status && req.query.status !== 'all') {
      filter.status = req.query.status;
    }

    const [reviews, total] = await Promise.all([
      KycVerification.find(filter)
        .populate('user', 'firstName lastName email phone kyc createdAt')
        .populate('reviewedBy', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      KycVerification.countDocuments(filter)
    ]);

    res.json({
      success: true,
      data: {
        reviews: reviews.map((review) => ({
          id: review._id,
          user: review.user,
          status: review.status,
          provider: review.provider,
          checkType: review.checkType,
          submittedAt: review.submittedAt,
          verifiedAt: review.verifiedAt,
          reviewedAt: review.reviewedAt,
          reviewedBy: review.reviewedBy,
          reviewReason: review.reviewReason,
          failureReason: review.failureReason,
          faceCount: review.faceCheck?.faceCount ?? null,
          faceCheckConfidence: review.faceCheck?.confidence ?? null,
          threshold: review.faceCheck?.threshold ?? null,
          createdAt: review.createdAt,
        })),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) }
      }
    });
  } catch (error) {
    console.error('Admin KYC reviews error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// PUT /api/admin/ekyc/reviews/:id/approve — manually approve a review
router.put('/ekyc/reviews/:id/approve', [
  param('id').isMongoId()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const review = await KycVerification.findById(req.params.id);
    if (!review) return res.status(404).json({ success: false, message: 'KYC review not found' });

    review.status = 'verified';
    review.verifiedAt = new Date();
    review.reviewedAt = new Date();
    review.reviewedBy = req.user._id;
    review.reviewReason = 'Manual admin approval';
    await review.save();

    await User.findByIdAndUpdate(review.user, {
      $set: {
        kyc: {
          status: 'verified',
          provider: review.provider,
          submittedAt: review.submittedAt,
          verifiedAt: review.verifiedAt,
          reviewedAt: review.reviewedAt,
          reviewedBy: req.user._id,
          reviewReason: review.reviewReason,
          faceCheckConfidence: review.faceCheck?.confidence,
        }
      }
    });

    res.json({ success: true, message: 'KYC review approved.', data: { reviewId: review._id, status: review.status } });
  } catch (error) {
    console.error('Admin approve KYC error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// PUT /api/admin/ekyc/reviews/:id/reject — reject a review with a reason
router.put('/ekyc/reviews/:id/reject', [
  param('id').isMongoId(),
  body('reason').trim().notEmpty().withMessage('Rejection reason is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const review = await KycVerification.findById(req.params.id);
    if (!review) return res.status(404).json({ success: false, message: 'KYC review not found' });

    review.status = 'rejected';
    review.reviewedAt = new Date();
    review.reviewedBy = req.user._id;
    review.reviewReason = req.body.reason;
    await review.save();

    await User.findByIdAndUpdate(review.user, {
      $set: {
        kyc: {
          status: 'rejected',
          provider: review.provider,
          submittedAt: review.submittedAt,
          reviewedAt: review.reviewedAt,
          reviewedBy: req.user._id,
          reviewReason: review.reviewReason,
          faceCheckConfidence: review.faceCheck?.confidence,
        }
      }
    });

    res.json({ success: true, message: 'KYC review rejected.', data: { reviewId: review._id, status: review.status } });
  } catch (error) {
    console.error('Admin reject KYC error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /api/admin/bookings — recent booking/session list for call operations
router.get('/bookings', [
  query('status').optional().isString(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });

    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '25', 10);
    const filter = { sessionType: 'video' };
    if (req.query.status) {
      const statuses = String(req.query.status)
        .split(',')
        .map((status) => status.trim())
        .filter(Boolean);
      filter.status = statuses.length > 1 ? { $in: statuses } : statuses[0];
    }

    const [bookings, total] = await Promise.all([
      Booking.find(filter)
        .populate('user', 'firstName lastName email phone address country accountRegion region')
        .populate({
          path: 'counsellor',
          select: 'user',
          populate: { path: 'user', select: 'firstName lastName email phone' }
        })
        .sort({ scheduledAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Booking.countDocuments(filter)
    ]);

    res.json({
      success: true,
      data: {
        bookings: bookings.map(formatAdminBooking),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) }
      }
    });
  } catch (error) {
    console.error('Admin bookings error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// PATCH /api/admin/bookings/:id/call-link — configure approved external session link
router.patch('/bookings/:id/call-link', [
  param('id').isMongoId().withMessage('Invalid booking ID'),
  body('provider').isString().trim().notEmpty(),
  body('externalJoinUrl').isString().trim().custom(isSafeHttpsUrl).withMessage('External join URL must be HTTPS'),
  body('externalHostUrl').optional({ nullable: true, checkFalsy: true }).isString().trim().custom(isSafeHttpsUrl).withMessage('External host URL must be HTTPS'),
  body('externalProviderName').optional({ nullable: true, checkFalsy: true }).isString().trim().isLength({ max: 80 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });

    const provider = normalizeProvider(req.body.provider, '');
    if (!isAllowedExternalProvider(provider)) {
      return res.status(400).json({ success: false, message: 'Unsupported external provider.' });
    }

    const booking = await Booking.findById(req.params.id)
      .populate('user', 'firstName lastName phone address country accountRegion region')
      .populate({
        path: 'counsellor',
        select: 'user',
        populate: { path: 'user', select: 'firstName lastName phone address country accountRegion region' }
      });

    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    const policy = resolveCallPolicy({ user: booking.user, booking, req: { headers: req.headers, user: req.user } });
    if (policy.provider === 'livekit') {
      return res.status(400).json({ success: false, message: 'LiveKit is enabled for this session region; external links are only for external-provider sessions.' });
    }
    if (policy.joinMode === 'disabled') {
      return res.status(403).json({ success: false, message: 'Video calling is disabled until this session region is verified.' });
    }

    booking.videoCall.provider = provider;
    booking.videoCall.joinMode = 'external_link';
    booking.videoCall.region = policy.region;
    booking.videoCall.status = 'ready';
    booking.videoCall.policyReason = policy.reason;
    booking.videoCall.lastPolicyCheckAt = new Date();
    booking.videoCall.externalJoinUrl = req.body.externalJoinUrl.trim();
    booking.videoCall.externalHostUrl = req.body.externalHostUrl ? req.body.externalHostUrl.trim() : undefined;
    booking.videoCall.externalProviderName = req.body.externalProviderName?.trim() || providerDisplayName(provider);
    booking.videoCall.configuredBy = req.user._id;
    booking.videoCall.configuredAt = new Date();
    await booking.save();

    res.json({
      success: true,
      message: 'External session link saved.',
      data: {
        bookingId: booking._id,
        videoCall: formatVideoCall(booking.videoCall)
      }
    });
  } catch (error) {
    console.error('Admin configure call link error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
