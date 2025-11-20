import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';    
import { View, ActivityIndicator } from 'react-native';
import { useEffect, useRef } from 'react';
import { useThemeMode } from '@/theme/ThemeProvider';
import { palettes } from '@/theme/colors';
import { useAuth } from '@/state/useAuth';
import { navigationRef } from '@/services/navigationService';
import TabNavigator from './TabNavigator';
import Onboarding from '@/screens/auth/Onboarding';
import Login from '@/screens/auth/Login';
import Register from '@/screens/auth/Register';
import Forgot from '@/screens/auth/Forgot';
import Verify from '@/screens/auth/Verify';
import BookingReview from '@/screens/booking/BookingReview';
import PaymentSheet from '@/screens/booking/PaymentSheet';
import BookingSuccess from '@/screens/booking/BookingSuccess';
import GenderSelection from '@/screens/booking/GenderSelection';
import SessionReview from '@/screens/booking/SessionReview';
import ChatThread from '@/screens/chat/ChatThread';
import PreCallCheck from '@/screens/call/PreCallCheck';
import CallJoin from '@/screens/call/CallJoin';
import EditProfile from '@/screens/profile/EditProfile';
import Settings from '@/screens/profile/Settings';
import Legal from '@/screens/profile/Legal';
import CrisisHelp from '@/screens/profile/CrisisHelp';
import ChangePassword from '@/screens/profile/ChangePassword';
import TwoFactorAuth from '@/screens/profile/TwoFactorAuth';
import PrivacySettings from '@/screens/profile/PrivacySettings';
import SubscriptionPayment from '@/screens/subscription/SubscriptionPayment';
import SubscriptionSuccess from '@/screens/subscription/SubscriptionSuccess';

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  const { isAuthed, isLoading } = useAuth();
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const prevIsAuthedRef = useRef<boolean | null>(null);
  const prevIsLoadingRef = useRef<boolean>(true);

  // Ensure navigation happens when loading completes
  useEffect(() => {
    // When loading completes and user is not authenticated, ensure we're on Onboarding
    if (!isLoading && prevIsLoadingRef.current && !isAuthed && navigationRef.isReady()) {
      console.log('[RootNavigator] Loading completed, user not authenticated, navigating to Onboarding');
      setTimeout(() => {
        try {
          if (navigationRef.isReady()) {
            const currentRoute = navigationRef.getCurrentRoute();
            console.log('[RootNavigator] Current route:', currentRoute?.name);
            if (currentRoute?.name !== 'Onboarding') {
              console.log('[RootNavigator] Resetting to Onboarding');
              navigationRef.reset({
                index: 0,
                routes: [{ name: 'Onboarding' }],
              });
            }
          }
        } catch (error) {
          console.error('[RootNavigator] Navigation error:', error);
        }
      }, 100);
    }

    prevIsLoadingRef.current = isLoading;
  }, [isLoading, isAuthed]);

  // React to auth state changes (when user logs out)
  useEffect(() => {
    // Skip on initial mount
    if (prevIsAuthedRef.current === null) {
      prevIsAuthedRef.current = isAuthed;
      return;
    }

    // Only navigate when auth state changes from authenticated to unauthenticated
    if (!isLoading && navigationRef.isReady() && prevIsAuthedRef.current === true && !isAuthed) {
      // User logged out - navigate to Onboarding
      // Use setTimeout to ensure navigation happens after state update
      setTimeout(() => {
        try {
          if (navigationRef.isReady()) {
            navigationRef.reset({
              index: 0,
              routes: [{ name: 'Onboarding' }],
            });
          }
        } catch (error) {
          console.error('Navigation error in RootNavigator:', error);
        }
      }, 100);
    }

    prevIsAuthedRef.current = isAuthed;
  }, [isAuthed, isLoading]);

  // Show loading screen while checking authentication
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Determine initial route based on authentication status
  const initialRouteName = isAuthed ? 'Tabs' : 'Onboarding';

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName={initialRouteName}>
        <Stack.Screen name="Tabs" component={TabNavigator} />
        <Stack.Screen name="Onboarding" component={Onboarding} />
        <Stack.Screen name="Login" component={Login} />
        <Stack.Screen name="Register" component={Register} />
        <Stack.Screen name="Forgot" component={Forgot} />
        <Stack.Screen name="Verify" component={Verify} />
        <Stack.Screen name="BookingReview" component={BookingReview} />
        <Stack.Screen name="PaymentSheet" component={PaymentSheet} />
        <Stack.Screen name="BookingSuccess" component={BookingSuccess} />
        <Stack.Screen name="GenderSelection" component={GenderSelection} />
        <Stack.Screen name="SessionReview" component={SessionReview} />
        <Stack.Screen name="ChatThread" component={ChatThread} />
        <Stack.Screen name="PreCallCheck" component={PreCallCheck} />
        <Stack.Screen name="CallJoin" component={CallJoin} />
        <Stack.Screen name="EditProfile" component={EditProfile} />
        <Stack.Screen name="Settings" component={Settings} />
        <Stack.Screen name="Legal" component={Legal} />
        <Stack.Screen name="CrisisHelp" component={CrisisHelp} />
        <Stack.Screen name="ChangePassword" component={ChangePassword} />
        <Stack.Screen name="TwoFactorAuth" component={TwoFactorAuth} />
        <Stack.Screen name="PrivacySettings" component={PrivacySettings} />
        <Stack.Screen name="SubscriptionPayment" component={SubscriptionPayment} />
        <Stack.Screen name="SubscriptionSuccess" component={SubscriptionSuccess} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
