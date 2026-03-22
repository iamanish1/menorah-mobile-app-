import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RootNavigator from '@/navigation/RootNavigator';
import { ThemeProvider, useThemeMode } from '@/theme/ThemeProvider';     
import { AuthProvider } from '@/state/useAuth';
import { ChatProvider } from '@/state/useChat';
import { NotificationProvider } from '@/state/useNotifications';
import FreeSessionModal from '@/components/modals/FreeSessionModal';
import SessionNotificationHandler from '@/components/SessionNotificationHandler';
import subscriptionService from '@/services/subscriptionService';

const queryClient = new QueryClient();

// helper component for dynamic status bar
function ThemeStatusBar() {
  const { scheme } = useThemeMode();
  return <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />;
}

export default function App() {
  const [showFreeSessionModal, setShowFreeSessionModal] = useState(false);

  useEffect(() => {
    checkFirstTimeUser();
  }, []);

  const checkFirstTimeUser = async () => {
    try {
      const hasSeenModal = await AsyncStorage.getItem('hasSeenFreeSessionModal');
      const hasPremiumSubscription = await subscriptionService.hasPremiumSubscription();
      
      // Show modal only if:
      // 1. User hasn't seen the modal before
      // 2. User doesn't have premium subscription
      if (!hasSeenModal && !hasPremiumSubscription) {
        setShowFreeSessionModal(true);
      }
    } catch (error) {
      console.log('Error checking first time user:', error);
    }
  };

  const handleCloseModal = async () => {
    try {
      await AsyncStorage.setItem('hasSeenFreeSessionModal', 'true');
      setShowFreeSessionModal(false);
    } catch (error) {
      console.log('Error saving modal state:', error);
    }
  };

  const handleBookSession = async () => {
    try {
      await AsyncStorage.setItem('hasSeenFreeSessionModal', 'true');
      setShowFreeSessionModal(false);
      // Navigate to booking flow - this will be handled by the navigation system
    } catch (error) {
      console.log('Error handling book session:', error);
    }
  };

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <NotificationProvider>
              <ChatProvider>
                <RootNavigator />
                <ThemeStatusBar />
                <SessionNotificationHandler />
                <FreeSessionModal
                  visible={showFreeSessionModal}
                  onClose={handleCloseModal}
                  onBookSession={handleBookSession}
                />
              </ChatProvider>
            </NotificationProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
