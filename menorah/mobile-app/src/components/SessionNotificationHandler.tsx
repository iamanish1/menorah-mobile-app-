import { useCallback, useEffect } from 'react';
import { Alert } from 'react-native';
import { socketService, SessionStartedData } from '@/lib/socket';
import { navigate } from '@/services/navigationService';

/**
 * Component that handles session started notifications
 * Shows alert when counselor starts a session and allows user to join
 */
export default function SessionNotificationHandler() {
  const navigateToSession = useCallback((bookingId: string, sessionType: string) => {
    try {
      if (sessionType === 'video' || sessionType === 'audio') {
        navigate('PreCallCheck', { bookingId });
      } else {
        navigate('ChatThread', { roomId: bookingId });
      }
    } catch (error) {
      console.error('Error navigating to session:', error);
      Alert.alert('Error', 'Failed to navigate to session. Please try again.');
    }
  }, []);

  const handleSessionStarted = useCallback((data: SessionStartedData) => {
    const { bookingId, counsellorName, sessionType } = data;

    Alert.alert(
      'Session Started',
      `${counsellorName} is waiting for you. Please join your session now.`,
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
  }, [navigateToSession]);

  useEffect(() => {
    // Subscribe to session started events
    const unsubscribe = socketService.onSessionStarted((data: SessionStartedData) => {
      handleSessionStarted(data);
    });

    return () => {
      unsubscribe();
    };
  }, [handleSessionStarted]);

  // This component doesn't render anything
  return null;
}
