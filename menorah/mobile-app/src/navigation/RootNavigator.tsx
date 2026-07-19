import { NavigationContainer, getStateFromPath, type LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, ActivityIndicator } from 'react-native';
import { useEffect, useRef } from 'react';
import * as Linking from 'expo-linking';
import { useThemeMode } from '@/theme/ThemeProvider';
import { palettes } from '@/theme/colors';
import { useAuth } from '@/state/useAuth';
import { navigationRef } from '@/services/navigationService';
import { ENV } from '@/lib/env';
import TabNavigator from './TabNavigator';
import Onboarding from '@/screens/auth/Onboarding';
import Login from '@/screens/auth/Login';
import Register from '@/screens/auth/Register';
import Forgot from '@/screens/auth/Forgot';
import ResetPassword from '../screens/auth/ResetPassword';
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
import IdentityVerification from '@/screens/profile/IdentityVerification';
import SubscriptionDetails from '@/screens/subscription/SubscriptionDetails';
import SubscriptionPayment from '@/screens/subscription/SubscriptionPayment';
import SubscriptionSuccess from '@/screens/subscription/SubscriptionSuccess';
import Notifications from '@/screens/profile/Notifications';
import CounsellorList from '@/screens/counsellor/CounsellorList';
import CounsellorProfile from '@/screens/counsellor/CounsellorProfile';
import ArticleList from '@/screens/articles/ArticleList';
import ArticleDetail from '@/screens/articles/ArticleDetail';

const Stack = createNativeStackNavigator();
const PUBLIC_ROUTES = new Set(['Onboarding', 'Login', 'Register', 'Forgot', 'ResetPassword', 'Verify']);
const PUBLIC_WEB_BASE_URL = ENV.WEB_BASE_URL.replace(/\/+$/, '');

export default function RootNavigator() {
  const { isAuthed, isLoading } = useAuth();
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const prevIsAuthedRef = useRef<boolean | null>(null);
  const prevIsLoadingRef = useRef<boolean>(true);
  const linking: LinkingOptions<any> = {
    prefixes: [
      Linking.createURL('/'),
      'menorah-health://',
      'exp+menorah-health-app://',
      PUBLIC_WEB_BASE_URL,
      `${PUBLIC_WEB_BASE_URL}/`,
      'https://menorah.me',
      'https://menorah.me/',
    ],
    config: {
      screens: {
        ResetPassword: 'reset-password',
        Tabs: {
          screens: {
            Discover: 'discover',
            Bookings: 'bookings',
            Chat: 'chat',
            Profile: 'profile',
          },
        },
        ArticleList: 'articles',
        ArticleDetail: 'articles/:slug',
      },
    },
    getStateFromPath: (path, options) => {
      const [pathname, fragment = ''] = path.split('#', 2);
      const state = getStateFromPath(pathname, options);
      const token = new URLSearchParams(fragment).get('token');
      const resetRoute = state?.routes?.[0];

      // App Links retain a URL fragment locally. Add it to the route only after
      // React Navigation has matched the trusted reset-password path.
      if (token && state && resetRoute?.name === 'ResetPassword') {
        return {
          ...state,
          routes: state.routes.map((route, index) => (
            index === 0
              ? { ...route, params: { ...(route.params || {}), token } }
              : route
          )),
        };
      }

      return state;
    },
  };

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
            if (currentRoute?.name && !PUBLIC_ROUTES.has(currentRoute.name)) {
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
    <NavigationContainer ref={navigationRef} linking={linking}>
      <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName={initialRouteName}>
        <Stack.Screen name="Tabs" component={TabNavigator} />
        <Stack.Screen name="Onboarding" component={Onboarding} />
        <Stack.Screen name="Login" component={Login} />
        <Stack.Screen name="Register" component={Register} />
        <Stack.Screen name="Forgot" component={Forgot} />
        <Stack.Screen name="ResetPassword" component={ResetPassword} />
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
        <Stack.Screen name="IdentityVerification" component={IdentityVerification} />
        <Stack.Screen name="Notifications" component={Notifications} />
        <Stack.Screen name="ArticleList" component={ArticleList} />
        <Stack.Screen name="ArticleDetail" component={ArticleDetail} />
        <Stack.Screen name="SubscriptionDetails" component={SubscriptionDetails} />
        <Stack.Screen name="SubscriptionPayment" component={SubscriptionPayment} />
        <Stack.Screen name="SubscriptionSuccess" component={SubscriptionSuccess} />
        <Stack.Screen name="CounsellorList" component={CounsellorList} />
        <Stack.Screen name="CounsellorProfile" component={CounsellorProfile} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
