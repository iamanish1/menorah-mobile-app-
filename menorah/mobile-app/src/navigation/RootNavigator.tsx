import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, ActivityIndicator, Text, TouchableOpacity } from 'react-native';
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
import LinkedAccounts from '@/screens/profile/LinkedAccounts';
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
const PUBLIC_WEB_BASE_URL = ENV.WEB_BASE_URL.replace(/\/+$/, '');
const ARTICLE_CANONICAL_BASE_URL = ENV.ARTICLE_CANONICAL_BASE_URL.replace(/\/+$/, '');

export default function RootNavigator() {
  const {
    isAuthed,
    isLoading,
    authenticatedEntryRoute,
    requiresProfileCompletion,
    retrySession,
    sessionRecoveryPending,
  } = useAuth();
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const linking: any = {
    prefixes: [
      Linking.createURL('/'),
      'menorah-health://',
      'exp+menorah-health-app://',
      PUBLIC_WEB_BASE_URL,
      `${PUBLIC_WEB_BASE_URL}/`,
      ARTICLE_CANONICAL_BASE_URL,
      `${ARTICLE_CANONICAL_BASE_URL}/`,
      ENV.API_ORIGIN,
      `${ENV.API_ORIGIN}/`,
      // Legacy article links use the former public hostname. Keep them
      // routable in native clients while new links use the apex canonical URL.
      'https://www.menorah.me',
      'https://www.menorah.me/',
    ],
    config: {
      screens: {
        ResetPassword: {
          path: 'reset-password',
          alias: ['api/auth/reset-password'],
        },
        // Published articles are public educational content. Keeping these
        // routes outside the authenticated branch lets a canonical landing
        // link open directly in the app for both new and signed-in readers.
        ArticleList: 'articles',
        ArticleDetail: 'articles/:slug',
        ...(isAuthed && !requiresProfileCompletion ? {
          Tabs: {
            screens: {
              Discover: 'discover',
              Bookings: 'bookings',
              Chat: 'chat',
              Profile: 'profile',
            },
          },
        } : {}),
      },
    },
  };

  // Show loading screen while checking authentication
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (sessionRecoveryPending) {
    return (
      <View style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 28,
        backgroundColor: colors.bg,
      }}>
        <Text style={{ color: colors.text, fontSize: 21, fontWeight: '700', textAlign: 'center' }}>
          We could not verify your session
        </Text>
        <Text style={{ color: colors.muted, fontSize: 15, textAlign: 'center', marginTop: 10 }}>
          Your sign-in is still stored securely. Check your connection and try again.
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={retrySession}
          style={{ marginTop: 24, paddingVertical: 14, paddingHorizontal: 28, borderRadius: 999, backgroundColor: colors.primary }}
        >
          <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Determine initial route based on authentication status
  const initialRouteName = isAuthed
    ? (requiresProfileCompletion ? 'EditProfile' : authenticatedEntryRoute)
    : 'Onboarding';

  return (
    <NavigationContainer ref={navigationRef} linking={linking}>
      <Stack.Navigator
        key={isAuthed ? 'authenticated' : 'guest'}
        screenOptions={{ headerShown: false }}
        initialRouteName={initialRouteName}
      >
        {!isAuthed ? (
          <>
            <Stack.Screen name="Onboarding" component={Onboarding} />
            <Stack.Screen name="Login" component={Login} />
            <Stack.Screen name="Register" component={Register} />
            <Stack.Screen name="Forgot" component={Forgot} />
            <Stack.Screen name="ResetPassword" component={ResetPassword} />
            <Stack.Screen name="Verify" component={Verify} />
            <Stack.Screen name="ArticleList" component={ArticleList} />
            <Stack.Screen name="ArticleDetail" component={ArticleDetail} />
          </>
        ) : requiresProfileCompletion ? (
          <>
            <Stack.Screen name="EditProfile" component={EditProfile} />
            <Stack.Screen name="ArticleList" component={ArticleList} />
            <Stack.Screen name="ArticleDetail" component={ArticleDetail} />
          </>
        ) : (
          <>
            <Stack.Screen name="Tabs" component={TabNavigator} />
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
            <Stack.Screen name="LinkedAccounts" component={LinkedAccounts} />
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
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
