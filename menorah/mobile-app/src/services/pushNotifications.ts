import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { api } from '@/lib/api';
import { secureStorage } from '@/lib/secureStorage';
import { reportError } from '@/lib/safeDiagnostics';
import {
  createPushDeviceLifecycle,
  type PendingPushDetachment,
  type StoredPushRegistration,
} from './pushDeviceLifecyclePolicy';

const PUSH_TOKEN_STORAGE_KEY = 'menorah.android.expo_push_token';
const PENDING_PUSH_DETACHMENTS_STORAGE_KEY =
  'menorah.android.pending_push_detachments';
const PUSH_STORAGE_OPTIONS = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
} as const;
const EXPO_PUSH_TOKEN_PATTERN =
  /^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]{16,}\]$/;

export type PushPermissionState =
  | 'granted'
  | 'denied'
  | 'undetermined'
  | 'unsupported';

export interface PushRegistrationResult {
  enabled: boolean;
  permission: PushPermissionState;
}

const isSafeString = (
  value: unknown,
  maximumLength: number,
): value is string => typeof value === 'string'
  && value.length > 0
  && value.length <= maximumLength;

const normalizeRegistration = (
  value: unknown,
): StoredPushRegistration | null => {
  if (typeof value === 'string' && EXPO_PUSH_TOKEN_PATTERN.test(value)) {
    // Migrate the token-only format written by releases before 2.7.0.
    return { expoPushToken: value, userId: null, projectId: null };
  }
  if (!value || typeof value !== 'object') return null;

  const candidate = value as Partial<StoredPushRegistration>;
  if (!isSafeString(candidate.expoPushToken, 256)
    || !EXPO_PUSH_TOKEN_PATTERN.test(candidate.expoPushToken)) return null;
  if (candidate.userId !== null && candidate.userId !== undefined
    && !isSafeString(candidate.userId, 128)) return null;
  if (candidate.projectId !== null && candidate.projectId !== undefined
    && !isSafeString(candidate.projectId, 128)) return null;

  return {
    expoPushToken: candidate.expoPushToken,
    userId: candidate.userId || null,
    projectId: candidate.projectId || null,
  };
};

const readStoredRegistration = async (): Promise<StoredPushRegistration | null> => {
  const raw = await SecureStore.getItemAsync(PUSH_TOKEN_STORAGE_KEY);
  if (!raw) return null;

  if (EXPO_PUSH_TOKEN_PATTERN.test(raw)) return normalizeRegistration(raw);
  try {
    const registration = normalizeRegistration(JSON.parse(raw));
    if (!registration) throw new Error('Stored push registration is invalid.');
    return registration;
  } catch (error) {
    reportError('push.registration_storage_invalid', error);
    throw new Error('Stored push registration requires recovery.');
  }
};

const normalizePendingDetachment = (
  value: unknown,
): PendingPushDetachment | null => {
  const registration = normalizeRegistration(value);
  if (!registration || !value || typeof value !== 'object') return null;
  const candidate = value as Partial<PendingPushDetachment>;
  if (!isSafeString(candidate.authToken, 32768)) return null;
  if (typeof candidate.logoutAfterDetach !== 'boolean') return null;
  if (typeof candidate.claimBeforeDetach !== 'boolean') return null;
  return {
    ...registration,
    authToken: candidate.authToken,
    logoutAfterDetach: candidate.logoutAfterDetach,
    claimBeforeDetach: candidate.claimBeforeDetach,
  };
};

const readPendingDetachments = async (): Promise<PendingPushDetachment[]> => {
  const raw = await SecureStore.getItemAsync(PENDING_PUSH_DETACHMENTS_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('Pending push detachments are invalid.');
    const normalized = parsed.map(normalizePendingDetachment);
    if (normalized.some(candidate => !candidate)) {
      throw new Error('A pending push detachment is invalid.');
    }
    return normalized as PendingPushDetachment[];
  } catch (error) {
    reportError('push.pending_detachment_storage_invalid', error);
    // Fail closed: never overwrite or delete an unreadable queue that may be
    // the only remaining path to detach a device from a signed-out account.
    throw new Error('Pending push detachment requires recovery.');
  }
};

const writePendingDetachments = async (
  detachments: PendingPushDetachment[],
): Promise<void> => {
  if (!detachments.length) {
    await SecureStore.deleteItemAsync(PENDING_PUSH_DETACHMENTS_STORAGE_KEY);
    return;
  }
  await SecureStore.setItemAsync(
    PENDING_PUSH_DETACHMENTS_STORAGE_KEY,
    JSON.stringify(detachments),
    PUSH_STORAGE_OPTIONS,
  );
};

const pushDeviceLifecycle = createPushDeviceLifecycle({
  getCurrentAuthToken: () => secureStorage.getToken(),
  readRegistration: readStoredRegistration,
  writeRegistration: (registration) => SecureStore.setItemAsync(
    PUSH_TOKEN_STORAGE_KEY,
    JSON.stringify(registration),
    PUSH_STORAGE_OPTIONS,
  ),
  deleteRegistrationIfMatches: async (registration) => {
    const current = await readStoredRegistration();
    if (
      current?.expoPushToken === registration.expoPushToken
      && (
        !current.userId
        || current.userId === (registration.userId || null)
      )
    ) {
      await SecureStore.deleteItemAsync(PUSH_TOKEN_STORAGE_KEY);
    }
  },
  readPendingDetachments,
  writePendingDetachments,
  registerRemote: (registration, authToken) => api.registerPushDeviceWithToken({
    expoPushToken: registration.expoPushToken,
    platform: 'android',
    projectId: registration.projectId || '',
  }, authToken),
  unregisterRemote: (registration, authToken) =>
    api.unregisterPushDeviceWithToken(registration.expoPushToken, authToken),
  logoutRemote: (authToken) => api.logoutToken(authToken),
  queuePendingLogoutToken: (authToken) =>
    secureStorage.queuePendingLogoutToken(authToken),
  reportError,
});

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const projectId = (): string | null => {
  const value = Constants.easConfig?.projectId
    || (Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined)
      ?.eas?.projectId;
  return typeof value === 'string' && value.length <= 128 ? value : null;
};

export async function configureAndroidNotificationChannelsAsync(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Promise.all([
    Notifications.setNotificationChannelAsync('general', {
      name: 'General updates',
      description: 'Account, booking, and service updates',
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: '#2d7a5c',
      sound: 'default',
    }),
    Notifications.setNotificationChannelAsync('messages', {
      name: 'Chat messages',
      description: 'New messages from your counsellor',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 150, 250],
      lightColor: '#2d7a5c',
      sound: 'default',
    }),
    Notifications.setNotificationChannelAsync('sessions', {
      name: 'Upcoming sessions',
      description: 'Reminders for booked counselling sessions',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 150, 250],
      lightColor: '#2d7a5c',
      sound: 'default',
    }),
    Notifications.setNotificationChannelAsync('articles', {
      name: 'New articles',
      description: 'New Menorah mental-health articles',
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: '#2d7a5c',
      sound: 'default',
    }),
  ]);
}

const mapPermission = (
  status: Notifications.PermissionStatus,
): PushPermissionState => {
  if (status === Notifications.PermissionStatus.GRANTED) return 'granted';
  if (status === Notifications.PermissionStatus.DENIED) return 'denied';
  return 'undetermined';
};

export async function getAndroidPushPermissionAsync(): Promise<PushPermissionState> {
  if (Platform.OS !== 'android') return 'unsupported';
  const permissions = await Notifications.getPermissionsAsync();
  return mapPermission(permissions.status);
}

export async function registerAndroidPushNotificationsAsync({
  requestPermission,
  userId,
}: {
  requestPermission: boolean;
  userId: string;
}): Promise<PushRegistrationResult> {
  if (Platform.OS !== 'android') {
    return { enabled: false, permission: 'unsupported' };
  }

  try {
    await configureAndroidNotificationChannelsAsync();
    let permissions = await Notifications.getPermissionsAsync();
    if (requestPermission && permissions.status !== Notifications.PermissionStatus.GRANTED) {
      permissions = await Notifications.requestPermissionsAsync();
    }

    const permission = mapPermission(permissions.status);
    if (permission !== 'granted') return { enabled: false, permission };

    const easProjectId = projectId();
    if (!easProjectId) {
      reportError('push.project_id_missing');
      return { enabled: false, permission };
    }

    const token = await Notifications.getExpoPushTokenAsync({ projectId: easProjectId });
    const authToken = await secureStorage.getToken();
    if (!authToken) return { enabled: false, permission };

    const result = await pushDeviceLifecycle.registerCurrent({
      expoPushToken: token.data,
      projectId: easProjectId,
      userId,
    }, authToken);
    if (!result.enabled) throw new Error('Push registration rejected');

    return { enabled: true, permission };
  } catch (error) {
    reportError('push.registration_failed', error);
    return { enabled: false, permission: 'undetermined' };
  }
}

export async function unregisterStoredPushDeviceAsync(
  expectedUserId?: string,
): Promise<boolean> {
  const authToken = await secureStorage.getToken();
  if (!authToken) return !(await readStoredRegistration());

  const result = await pushDeviceLifecycle.unregisterCurrent(
    authToken,
    expectedUserId,
  );
  return result.status !== 'queued';
}

export const beginPushAccountTransitionAsync = () =>
  pushDeviceLifecycle.beginAccountTransition();

export const preparePushDeviceForAccountTransitionAsync = (
  authToken: string,
  expectedUserId?: string,
) => pushDeviceLifecycle.prepareAccountTransition(authToken, expectedUserId);

export const endPushAccountTransition = () =>
  pushDeviceLifecycle.endAccountTransition();

export const retryPendingPushDeviceDetachmentsAsync = () =>
  pushDeviceLifecycle.retryPendingDetachments();

export const addPushTokenChangeListener = (listener: () => void) =>
  Notifications.addPushTokenListener(() => listener());

export const addPushResponseListener = (
  listener: (response: Notifications.NotificationResponse) => void,
) => Notifications.addNotificationResponseReceivedListener(listener);

export const getLastPushResponseAsync = () => Notifications.getLastNotificationResponseAsync();

export const clearLastPushResponseAsync = async (): Promise<void> => {
  await Notifications.clearLastNotificationResponseAsync();
};
