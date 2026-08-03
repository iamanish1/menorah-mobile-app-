const express = require('express');
const crypto = require('crypto');
const { body, param, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const sharp = require('sharp');
const User = require('../models/User');
const Counsellor = require('../models/Counsellor');
const AccountDeletionChallenge = require('../models/AccountDeletionChallenge');
const { auth } = require('../middleware/auth');
const { storeMediaBuffer } = require('../services/mediaStorage');
const { clearMappedSessionCookie } = require('../config/webSessions');
const { revokeAllSessions } = require('../utils/sessionLifecycle');
const {
  accountDeletionService,
} = require('../services/accountDeletionService');
const { getMaskedBankAccountNumber } = require('../utils/bankAccountEncryption');
const { encryptAppleRefreshToken } = require('../utils/appleRefreshTokenEncryption');
const {
  exchangeAppleAuthorizationCode,
  verifyAppleIdentityToken,
} = require('../services/appleSignInService');
const {
  PASSWORD_STRENGTH_MESSAGE,
  PASSWORD_STRENGTH_OPTIONS,
} = require('../config/passwordPolicy');
const {
  serializePublicUser,
  serializeUserProfile,
} = require('../serializers/userSerializer');
const {
  EXPO_PUSH_TOKEN_PATTERN,
  PushDeviceError,
  disablePushDevicesForUser,
  registerPushDevice,
  unregisterPushDevice,
} = require('../services/pushDeviceService');

const router = express.Router();
const leanWithPasswordAuth = (query) => {
  const selected = typeof query?.select === 'function'
    ? query.select('+passwordAuthEnabled')
    : query;
  return typeof selected?.lean === 'function' ? selected.lean() : selected;
};
const accountDeletionChallengeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `account-deletion:${String(req.user?._id || 'unauthenticated')}`,
});
const pushDeviceLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `push-device:${String(req.user?._id || 'unauthenticated')}`,
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 5 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image uploads are allowed'));
    }
    cb(null, true);
  },
});

// @route   GET /api/users/me
// @desc    Get current user (includes counsellor profile + bank details when role=counsellor)
// @access  Private
router.get('/me', auth, async (req, res) => {
  try {
    const user = await leanWithPasswordAuth(User.findById(req.user._id));
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    let counsellorProfile = null;
    if (user.role === 'counsellor') {
      const c = await Counsellor.findOne({ user: user._id }).lean();
      if (c) {
        // Mask bank account number — only show last 4 digits
        const maskedBank = c.bankDetails ? {
          accountHolderName: c.bankDetails.accountHolderName,
          bankName:          c.bankDetails.bankName,
          ifscCode:          c.bankDetails.ifscCode,
          accountNumberMasked: getMaskedBankAccountNumber(c.bankDetails),
        } : null;

        counsellorProfile = {
          specialization:    c.specialization,
          specializations:   c.specializations,
          yearsOfExperience: c.experience,
          hourlyRate:        c.hourlyRate,
          currency:          c.currency,
          bio:               c.bio,
          languages:         c.languages,
          licenseNumber:     c.licenseNumber,
          availability:      c.availability,
          isVerified:        c.isVerified,
          isActive:          c.isActive,
          profileImage:      c.profileImage || null,
          voiceIntroUrl:     c.voiceIntroUrl || null,
          voiceIntroDurationSeconds: c.voiceIntroDurationSeconds || null,
          profileMediaCompletedAt: c.profileMediaCompletedAt || null,
          profileMediaComplete: Boolean(c.profileImage && c.voiceIntroUrl),
          // commissionRate omitted — internal business metric
          bankDetails:       maskedBank,
        };
      }
    }

    res.json({
      success: true,
      data: { user: serializeUserProfile(user, { counsellorProfile }) }
    });

  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/users/profile
// @desc    Get current user's profile
// @access  Private
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await leanWithPasswordAuth(User.findById(req.user._id));
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: { user: serializeUserProfile(user) }
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   PUT /api/users/profile
// @desc    Update current user's profile
// @access  Private
router.put('/profile', auth, upload.single('profileImage'), [
  body('firstName').optional().trim().isLength({ min: 2, max: 50 }).withMessage('First name must be between 2 and 50 characters'),
  body('lastName').optional().trim().isLength({ min: 2, max: 50 }).withMessage('Last name must be between 2 and 50 characters'),
  body('dateOfBirth').optional().isISO8601().withMessage('Please provide a valid date of birth'),
  body('gender').optional().isIn(['male', 'female', 'other', 'prefer-not-to-say']).withMessage('Please provide a valid gender'),
  body('preferredLanguage').optional().isString(),
  body('timezone').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const {
      firstName,
      lastName,
      dateOfBirth,
      gender,
      preferredLanguage,
      timezone
    } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update fields
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (dateOfBirth) user.dateOfBirth = dateOfBirth;
    if (gender) user.gender = gender;
    if (preferredLanguage) user.preferredLanguage = preferredLanguage;
    if (timezone) user.timezone = timezone;

    if (req.file?.buffer) {
      try {
        const safeProfileImage = await sharp(req.file.buffer, {
          failOn: 'warning',
          limitInputPixels: 16_000_000,
        })
          .rotate()
          .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 86, mozjpeg: true })
          .toBuffer();
        const uploadResult = await storeMediaBuffer(safeProfileImage, {
          service: 'user-profile',
          category: 'images',
          extension: '.jpg',
          contentType: 'image/jpeg',
          cloudinaryFolder: 'menorah/profile-images',
          cloudinaryResourceType: 'image',
        });

        user.profileImage = uploadResult.url;
        user.profileImageStorage = uploadResult.metadata;
      } catch (uploadError) {
        console.error('Profile image upload error:', uploadError);
        return res.status(500).json({
          success: false,
          message: 'Failed to upload profile image'
        });
      }
    }

    await user.save();

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: { user: serializeUserProfile(user) }
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   PUT /api/users/address
// @desc    Update user's address
// @access  Private
router.put('/address', [
  body('street').optional().isString(),
  body('city').optional().isString(),
  body('state').optional().isString(),
  body('country').optional().isString(),
  body('zipCode').optional().isString()
], auth, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { street, city, state, country, zipCode } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update address fields
    if (street) user.address.street = street;
    if (city) user.address.city = city;
    if (state) user.address.state = state;
    if (country) user.address.country = country;
    if (zipCode) user.address.zipCode = zipCode;

    await user.save();

    res.json({
      success: true,
      message: 'Address updated successfully',
      data: { address: user.address }
    });

  } catch (error) {
    console.error('Update address error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   PUT /api/users/emergency-contact
// @desc    Update user's emergency contact
// @access  Private
router.put('/emergency-contact', [
  body('name').notEmpty().withMessage('Emergency contact name is required'),
  body('relationship').notEmpty().withMessage('Relationship is required'),
  body('phone').isMobilePhone().withMessage('Please provide a valid phone number')
], auth, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { name, relationship, phone } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update emergency contact
    user.emergencyContact = {
      name,
      relationship,
      phone
    };

    await user.save();

    res.json({
      success: true,
      message: 'Emergency contact updated successfully',
      data: { emergencyContact: user.emergencyContact }
    });

  } catch (error) {
    console.error('Update emergency contact error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   PUT /api/users/notification-preferences
// @desc    Update user's notification preferences
// @access  Private
router.put('/notification-preferences', [
  body('email').optional().isBoolean().withMessage('Email preference must be a boolean'),
  body('sms').optional().isBoolean().withMessage('SMS preference must be a boolean'),
  body('push').optional().isBoolean().withMessage('Push preference must be a boolean')
], auth, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, sms, push } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update notification preferences
    if (email !== undefined) user.notificationPreferences.email = email;
    if (sms !== undefined) user.notificationPreferences.sms = sms;
    if (push !== undefined) user.notificationPreferences.push = push;

    await user.save();

    if (push === false) {
      try {
        await disablePushDevicesForUser({ userId: req.user._id });
      } catch (disableError) {
        console.error(
          'Disable push devices after preference update failed:',
          disableError?.code || 'PUSH_DEVICE_DISABLE_FAILED'
        );
      }
    }

    res.json({
      success: true,
      message: 'Notification preferences updated successfully',
      data: { notificationPreferences: user.notificationPreferences }
    });

  } catch (error) {
    console.error('Update notification preferences error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/users/push-devices
// @desc    Register the signed-in user's Android Expo push token
// @access  Private
router.post('/push-devices', auth, pushDeviceLimiter, [
  body('expoPushToken')
    .isString()
    .trim()
    .matches(EXPO_PUSH_TOKEN_PATTERN)
    .withMessage('A valid Android push token is required'),
  body('platform').equals('android').withMessage('Only Android push is supported'),
  body('projectId').optional({ nullable: true }).isString().trim().isLength({ max: 128 }),
], async (req, res) => {
  try {
    if (!validationResult(req).isEmpty()) {
      return res.status(400).json({ success: false, message: 'Invalid push registration' });
    }

    await registerPushDevice({
      userId: req.user._id,
      expoPushToken: req.body.expoPushToken,
      platform: req.body.platform,
      projectId: req.body.projectId,
    });

    return res.status(201).json({
      success: true,
      data: { registered: true },
    });
  } catch (error) {
    if (error instanceof PushDeviceError) {
      return res.status(400).json({ success: false, message: 'Invalid push registration' });
    }
    console.error('Register push device failed:', error?.code || 'PUSH_DEVICE_REGISTER_FAILED');
    return res.status(500).json({ success: false, message: 'Unable to enable push notifications' });
  }
});

// @route   DELETE /api/users/push-devices
// @desc    Disable this Android device for the signed-in user
// @access  Private
router.delete('/push-devices', auth, pushDeviceLimiter, [
  body('expoPushToken')
    .isString()
    .trim()
    .matches(EXPO_PUSH_TOKEN_PATTERN)
    .withMessage('A valid Android push token is required'),
], async (req, res) => {
  try {
    if (!validationResult(req).isEmpty()) {
      return res.status(400).json({ success: false, message: 'Invalid push registration' });
    }

    await unregisterPushDevice({
      userId: req.user._id,
      expoPushToken: req.body.expoPushToken,
    });
    return res.json({ success: true, data: { registered: false } });
  } catch (error) {
    if (error instanceof PushDeviceError) {
      return res.status(400).json({ success: false, message: 'Invalid push registration' });
    }
    console.error('Unregister push device failed:', error?.code || 'PUSH_DEVICE_DISABLE_FAILED');
    return res.status(500).json({ success: false, message: 'Unable to disable push notifications' });
  }
});

// @route   PUT /api/users/change-password
// @desc    Change user's password
// @access  Private
router.put('/change-password', [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isStrongPassword({ ...PASSWORD_STRENGTH_OPTIONS })
    .withMessage(PASSWORD_STRENGTH_MESSAGE)
], auth, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id).select('+password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }
    if (await user.comparePassword(newPassword)) {
      return res.status(409).json({
        success: false,
        message: 'New password must be different from the current password'
      });
    }

    // Update password
    user.password = newPassword;
    revokeAllSessions(user, { passwordChanged: true });
    await user.save();
    clearMappedSessionCookie(req, res);

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/users/account/deletion-challenge
// @desc    Issue a single-use nonce for social-provider account deletion
// @access  Private
router.post('/account/deletion-challenge', auth, accountDeletionChallengeLimiter, [
  body('method').equals('apple'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Unsupported deletion reauthentication method' });
    }
    if (process.env.APPLE_SIGN_IN_ENABLED !== 'true') {
      return res.status(503).json({ success: false, message: 'Apple verification is unavailable.' });
    }
    if (!req.user.socialAuth?.appleSub) {
      return res.status(409).json({
        success: false,
        code: 'ACCOUNT_REAUTH_METHOD_NOT_LINKED',
        message: 'This Apple identity is not linked to the account.',
      });
    }

    const challengeId = crypto.randomBytes(32).toString('hex');
    const nonce = crypto.randomBytes(32).toString('base64url');
    const nonceHash = crypto.createHash('sha256').update(nonce, 'utf8').digest('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await AccountDeletionChallenge.updateMany(
      {
        user: req.user._id,
        method: 'apple',
        consumedAt: null,
      },
      { $set: { consumedAt: new Date() } }
    );
    await AccountDeletionChallenge.create({
      challengeId,
      user: req.user._id,
      method: 'apple',
      nonceHash,
      sessionVersion: req.user.sessionVersion,
      expiresAt,
    });

    return res.status(201).json({
      success: true,
      data: { challengeId, nonce, expiresAt: expiresAt.toISOString() },
    });
  } catch (error) {
    console.error('Account deletion challenge error code:', error?.code || 'UNEXPECTED_ERROR');
    return res.status(500).json({ success: false, message: 'Could not start account deletion verification.' });
  }
});

// @route   DELETE /api/users/account
// @desc    Delete user account
// @access  Private
router.delete('/account', [
  body('method')
    .customSanitizer((value, { req }) => (
      value || (typeof req.body?.password === 'string' ? 'password' : value)
    ))
    .isIn(['password', 'apple']),
  body('password').optional().isString().isLength({ min: 1, max: 256 }),
  body('challengeId').optional().isString().matches(/^[a-f0-9]{64}$/),
  body('identityToken').optional().isString().isLength({ min: 20, max: 8192 }),
  body('authorizationCode').optional().isString().isLength({ min: 20, max: 4096 }),
], auth, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    let socialReauthentication = null;
    let providerRevocation = null;

    if (req.body.method === 'password') {
      if (typeof req.body.password !== 'string' || !req.body.password) {
        return res.status(400).json({ success: false, message: 'Password is required for account deletion' });
      }
    } else {
      if (process.env.APPLE_SIGN_IN_ENABLED !== 'true') {
        return res.status(503).json({ success: false, message: 'Apple verification is unavailable.' });
      }
      if (!req.body.challengeId || !req.body.identityToken || !req.body.authorizationCode) {
        return res.status(400).json({ success: false, message: 'Apple reauthentication is incomplete' });
      }

      const challenge = await AccountDeletionChallenge.findOneAndUpdate(
        {
          challengeId: req.body.challengeId,
          user: req.user._id,
          method: 'apple',
          purpose: 'account-deletion',
          sessionVersion: req.user.sessionVersion,
          consumedAt: null,
          expiresAt: { $gt: new Date() },
        },
        { $set: { consumedAt: new Date() } },
        { new: true }
      ).select('+nonceHash');
      if (!challenge) {
        return res.status(409).json({
          success: false,
          code: 'ACCOUNT_DELETION_CHALLENGE_INVALID',
          message: 'Deletion verification expired or was already used. Start again.',
        });
      }

      const appleUser = await verifyAppleIdentityToken(req.body.identityToken);
      const receivedNonceHash = crypto
        .createHash('sha256')
        .update(String(appleUser.nonce || ''), 'utf8')
        .digest('hex');
      const nonceMatches = crypto.timingSafeEqual(
        Buffer.from(challenge.nonceHash, 'hex'),
        Buffer.from(receivedNonceHash, 'hex')
      );
      if (!nonceMatches || appleUser.sub !== req.user.socialAuth?.appleSub) {
        return res.status(403).json({
          success: false,
          code: 'ACCOUNT_APPLE_REAUTH_INVALID',
          message: 'Apple reauthentication did not match this account.',
        });
      }

      const clientId = String(appleUser.aud || '').trim();
      const appleTokens = await exchangeAppleAuthorizationCode({
        authorizationCode: req.body.authorizationCode,
        clientId,
        expectedSubject: appleUser.sub,
        expectedNonce: appleUser.nonce,
      });
      providerRevocation = {
        provider: 'apple',
        clientId,
        refreshTokenEncrypted: encryptAppleRefreshToken(
          appleTokens.refreshToken,
          { userId: req.user._id, clientId }
        ),
      };
      socialReauthentication = { provider: 'apple', subject: appleUser.sub };
    }

    await accountDeletionService.requestDeletion({
      userId: req.user._id,
      password: req.body.password,
      source: req.app.get('serviceName') || 'authenticated-api',
      ...(socialReauthentication ? { socialReauthentication } : {}),
      ...(providerRevocation ? { providerRevocation } : {}),
    });
    clearMappedSessionCookie(req, res);

    res.json({
      success: true,
      message: 'Account access has been disabled and your deletion request has been recorded for the retention review process.'
    });

  } catch (error) {
    const isAppleError = typeof error.appleErrorCode === 'string'
      && /^APPLE_[A-Z0-9_]{1,56}$/.test(error.appleErrorCode);
    const statusCode = isAppleError && error.statusCode === 401
      ? 403
      : isAppleError && error.statusCode === 503
        ? 503
        : Number.isInteger(error.statusCode)
      && error.statusCode >= 400
      && error.statusCode < 500
        ? error.statusCode
        : 500;
    if (statusCode >= 500) {
      const safeCode = isAppleError
        ? error.appleErrorCode
        : typeof error.code === 'string'
        && /^[A-Z0-9_]{1,64}$/.test(error.code)
          ? error.code
          : 'UNEXPECTED_ERROR';
      console.error('Delete account error code:', safeCode);
    }
    res.status(statusCode).json({
      success: false,
      message: isAppleError
        ? statusCode === 503
          ? 'Apple verification is temporarily unavailable.'
          : 'Apple reauthentication could not be verified.'
        : statusCode === 500
          ? 'Internal server error'
          : error.message,
      ...(isAppleError
        ? {
          code: statusCode === 503
            ? 'APPLE_VERIFICATION_UNAVAILABLE'
            : 'ACCOUNT_APPLE_REAUTH_INVALID',
        }
        : statusCode < 500 && error.code
          ? { code: error.code }
          : {}),
    });
  }
});

// @route   GET /api/users/:id
// @desc    Get user by ID (public profile)
// @access  Public
router.get('/:id', [
  param('id').isMongoId().withMessage('Invalid user ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { id } = req.params;

    const user = await User.findById(id)
      .select('firstName lastName profileImage isActive')
      .lean();

    if (!user || !user.isActive) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: { user: serializePublicUser(user) }
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;
