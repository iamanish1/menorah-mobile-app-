import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { api } from '@/lib/api';
import { reportError } from '@/lib/safeDiagnostics';

const PUSH_TOKEN_STORAGE_KEY = 'menorah.android.expo_push_token';

export type PushPermissionState =
  | 'granted'
  | 'denied'
  | 'undetermined'
  | 'unsupported';

export interface PushRegistrationResult {
  enabled: boolean;
  permission: PushPermissionState;
}

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
}: {
  requestPermission: boolean;
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
    const response = await api.registerPushDevice({
      expoPushToken: token.data,
      platform: 'android',
      projectId: easProjectId,
    });
    if (!response.success) throw new Error('Push registration rejected');

    await SecureStore.setItemAsync(PUSH_TOKEN_STORAGE_KEY, token.data);
    return { enabled: true, permission };
  } catch (error) {
    reportError('push.registration_failed', error);
    return { enabled: false, permission: 'undetermined' };
  }
}

export async function unregisterStoredPushDeviceAsync(): Promise<void> {
  const token = await SecureStore.getItemAsync(PUSH_TOKEN_STORAGE_KEY);
  if (!token) return;

  try {
    await api.unregisterPushDevice(token);
  } catch (error) {
    reportError('push.unregister_failed', error);
  } finally {
    await SecureStore.deleteItemAsync(PUSH_TOKEN_STORAGE_KEY);
  }
}

export const addPushResponseListener = (
  listener: (response: Notifications.NotificationResponse) => void,
) => Notifications.addNotificationResponseReceivedListener(listener);

export const getLastPushResponseAsync = () => Notifications.getLastNotificationResponseAsync();

export const clearLastPushResponseAsync = async (): Promise<void> => {
  await Notifications.clearLastNotificationResponseAsync();
};
