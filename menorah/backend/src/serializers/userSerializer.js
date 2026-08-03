const serializeUserProfile = (user, extras = {}) => {
  if (!user) return null;

  const source = typeof user.toObject === 'function'
    ? user.toObject({ virtuals: true })
    : user;
  const id = source._id?.toString?.() || source.id?.toString?.();
  const reauthenticationMethods = {
    password: source.passwordAuthEnabled === true,
    apple: Boolean(source.socialAuth?.appleSub),
    google: Boolean(source.socialAuth?.googleSub),
  };

  return {
    id,
    firstName: source.firstName,
    lastName: source.lastName,
    email: source.email,
    phone: source.phone,
    isEmailVerified: Boolean(source.isEmailVerified),
    isPhoneVerified: Boolean(source.isPhoneVerified),
    profileCompleted: source.profileCompleted !== false,
    linkedProviders: {
      google: Boolean(source.socialAuth?.googleSub),
      apple: Boolean(source.socialAuth?.appleSub),
    },
    profileImage: source.profileImage || null,
    dateOfBirth: source.dateOfBirth,
    gender: source.gender,
    address: source.address,
    emergencyContact: source.emergencyContact,
    preferredLanguage: source.preferredLanguage,
    timezone: source.timezone,
    notificationPreferences: source.notificationPreferences,
    subscription: source.subscription,
    kyc: source.kyc,
    role: source.role || 'user',
    reauthenticationMethods,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
    ...extras,
  };
};

const serializeAuthUser = (user, extras = {}) => {
  const profile = serializeUserProfile(user, extras);
  if (!profile) return null;

  return {
    id: profile.id,
    firstName: profile.firstName,
    lastName: profile.lastName,
    email: profile.email,
    phone: profile.phone,
    isEmailVerified: profile.isEmailVerified,
    isPhoneVerified: profile.isPhoneVerified,
    profileCompleted: profile.profileCompleted,
    linkedProviders: profile.linkedProviders,
    profileImage: profile.profileImage,
    role: profile.role,
    kyc: profile.kyc,
    reauthenticationMethods: profile.reauthenticationMethods,
    ...extras,
  };
};

const serializePublicUser = (user) => {
  if (!user) return null;
  const source = typeof user.toObject === 'function'
    ? user.toObject({ virtuals: false })
    : user;

  return {
    id: source._id?.toString?.() || source.id?.toString?.(),
    firstName: source.firstName,
    lastName: source.lastName,
    profileImage: source.profileImage || null,
  };
};

module.exports = {
  serializeUserProfile,
  serializeAuthUser,
  serializePublicUser,
};
