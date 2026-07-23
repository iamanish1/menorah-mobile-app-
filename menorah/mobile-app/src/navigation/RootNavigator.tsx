import { NavigationContainer, getStateFromPath, type LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, ActivityIndicator } from 'react-native';
import * as Linking from 'expo-linking';
import { useThemeMode } from '@/theme/ThemeProvider';
import { palettes } from '@/theme/colors';
import { useAuth } from '@/state/useAuth';
import { navigationRef } from '@/services/navigationService';
import {
  extractPasswordResetToken,
  isSafeNavigationIdentifier,
  splitDeepLinkPath,
} from '@/lib/deepLinks';
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
const CANONICAL_APP_LINK_ORIGIN = 'https://app.menorah.me';

export default function RootNavigator() {
  const { isAuthed, isLoading } = useAuth();
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const linking: LinkingOptions<any> = {
    prefixes: [
      Linking.createURL('/'),
      'menorah-health://',
      'exp+menorah-health-app://',
      CANONICAL_APP_LINK_ORIGIN,
      `${CANONICAL_APP_LINK_ORIGIN}/`,
    ],
    config: {
      screens: {
        ResetPassword: 'reset-password',
        ...(isAuthed ? {
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
        } : {}),
      },
    },
    getStateFromPath: (path, options) => {
      const parsedPath = splitDeepLinkPath(path);
      if (!parsedPath) {
        return undefined;
      }

      const state = getStateFromPath(parsedPath.pathname, options);
      const resetRoute = state?.routes?.[0];

      if (state && resetRoute?.name === 'ResetPassword') {
        const token = extractPasswordResetToken(parsedPath.fragment);
        return {
          ...state,
          routes: state.routes.map((route, index) => (
            index === 0
              ? { ...route, params: token ? { token } : undefined }
              : route
          )),
        };
      }

      if (
        state &&
        resetRoute?.name === 'ArticleDetail' &&
        !isSafeNavigationIdentifier(
          (resetRoute.params as { slug?: unknown } | undefined)?.slug
        )
      ) {
        return undefined;
      }

      return state;
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

  // Determine initial route based on authentication status
  const initialRouteName = isAuthed ? 'Tabs' : 'Onboarding';

  return (
    <NavigationContainer ref={navigationRef} linking={linking}>
      <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName={initialRouteName}>
        {isAuthed ? (
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
        ) : (
          <>
            <Stack.Screen name="Onboarding" component={Onboarding} />
            <Stack.Screen name="Login" component={Login} />
            <Stack.Screen name="Register" component={Register} />
            <Stack.Screen name="Forgot" component={Forgot} />
          </>
        )}
        <Stack.Screen name="ResetPassword" component={ResetPassword} />
        <Stack.Screen name="Verify" component={Verify} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
