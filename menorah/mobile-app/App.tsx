import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RootNavigator from '@/navigation/RootNavigator';
import { ThemeProvider, useThemeMode } from '@/theme/ThemeProvider';
import { AuthProvider } from '@/state/useAuth';
import { ChatProvider } from '@/state/useChat';
import { NotificationProvider } from '@/state/useNotifications';
import SessionNotificationHandler from '@/components/SessionNotificationHandler';
import UpdateBanner from '@/components/UpdateBanner';

const queryClient = new QueryClient();

function ThemeStatusBar() {
  const { scheme } = useThemeMode();
  return <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />;
}

export default function App() {
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
                <UpdateBanner />
              </ChatProvider>
            </NotificationProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
