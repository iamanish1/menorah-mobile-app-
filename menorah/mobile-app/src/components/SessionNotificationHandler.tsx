import { useCallback, useEffect } from 'react';
import { Alert } from 'react-native';
import { socketService, SessionStartedData } from '@/lib/socket';
import { navigate } from '@/services/navigationService';
import { isSafeNavigationIdentifier } from '@/lib/deepLinks';
import { reportError } from '@/lib/safeDiagnostics';
import { useAuth } from '@/state/useAuth';

/**
 * Component that handles session started notifications
 * Shows alert when counselor starts a session and allows user to join
 */
export default function SessionNotificationHandler() {
  const { user } = useAuth();

  const navigateToSession = useCallback((bookingId: string, sessionType: string) => {
    try {
      if (!user?.id || !isSafeNavigationIdentifier(bookingId)) {
        reportError('session_notification.invalid_booking');
        return;
      }

      if (sessionType === 'video' || sessionType === 'audio') {
        navigate('PreCallCheck', { bookingId });
      } else if (sessionType === 'chat') {
        navigate('ChatThread', { roomId: bookingId });
      }
    } catch (error) {
      reportError('session_notification.navigation_failed', error);
      Alert.alert('Error', 'Failed to navigate to session. Please try again.');
    }
  }, [user?.id]);

  const handleSessionStarted = useCallback((data: SessionStartedData) => {
    const { bookingId, sessionType } = data;

    if (
      !user?.id ||
      !isSafeNavigationIdentifier(bookingId) ||
      !['video', 'audio', 'chat'].includes(sessionType)
    ) {
      reportError('session_notification.invalid_payload');
      return;
    }

    Alert.alert(
      'Session Started',
      'Open Menorah to review and join your session.',
      [
        {
          text: 'Later',
          style: 'cancel',
        },
        {
          text: 'Join Session',
          onPress: () => {
            navigateToSession(bookingId, sessionType);
          },
        },
      ],
      { cancelable: false }
    );
  }, [navigateToSession, user?.id]);

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    // Subscribe to session started events
    const unsubscribe = socketService.onSessionStarted((data: SessionStartedData) => {
      handleSessionStarted(data);
    });

    return () => {
      unsubscribe();
    };
  }, [handleSessionStarted, user?.id]);

  // This component doesn't render anything
  return null;
}
