import type { User, UserRole } from './api';

export type SocialAuthIntent = 'signin' | 'signup';
export type SocialProvider = 'google' | 'apple';

const SOCIAL_PHONE_PREFIX = /^(google|apple):/i;
const E164_PHONE = /^\+[1-9]\d{1,14}$/;

export const isPatientRole = (role?: UserRole | null) => role === 'user';

export const isUsablePhone = (phone?: string | null) => {
  const normalized = String(phone || '').trim();
  return E164_PHONE.test(normalized) && !SOCIAL_PHONE_PREFIX.test(normalized);
};

export const displayPhone = (phone?: string | null) =>
  isUsablePhone(phone) ? String(phone).trim() : '';

export const needsSocialProfileCompletion = (
  user?: User | null,
  explicitRequirement = false,
) => Boolean(
  explicitRequirement
  || user?.needsProfileCompletion
  || user?.profileCompleted === false
  || !isUsablePhone(user?.phone),
);

export const isDefinitiveAuthFailure = (httpStatus?: number, code?: string) =>
  httpStatus === 401
  || code === 'TOKEN_EXPIRED'
  || code === 'TOKEN_REVOKED'
  || code === 'INVALID_TOKEN';
