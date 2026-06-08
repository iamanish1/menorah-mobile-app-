import React, { useEffect } from 'react';
import { Alert } from 'react-native';
import { socketService, SessionStartedData } from '@/lib/socket';
import { navigate } from '@/services/navigationService';

/**
 * Component that handles session started notifications
 * Shows alert when counselor starts a session and allows user to join
 */
export default function SessionNotificationHandler() {

  useEffect(() => {
    // Subscribe to session started events
    const unsubscribe = socketService.onSessionStarted((data: SessionStartedData) => {
      handleSessionStarted(data);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleSessionStarted = (data: SessionStartedData) => {
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
  };

  const navigateToSession = (bookingId: string, sessionType: string) => {
    try {
      if (sessionType === 'video') {
        // Navigate to PreCallCheck screen for video sessions
        navigate('PreCallCheck', { bookingId });
      } else if (sessionType === 'audio') {
        // Handle audio call - navigate to appropriate screen
        Alert.alert('Audio Call', 'Audio call feature coming soon');
      } else {
        // Navigate to chat for chat sessions
        navigate('ChatThread', { roomId: bookingId });
      }
    } catch (error) {
      console.error('Error navigating to session:', error);
      Alert.alert('Error', 'Failed to navigate to session. Please try again.');
    }
  };

  // This component doesn't render anything
  return null;
}

