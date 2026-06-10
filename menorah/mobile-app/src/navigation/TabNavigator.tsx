import React from 'react';
import { createBottomTabNavigator, type BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
import { Platform } from 'react-native';
import { Search, Calendar, MessageCircle, User } from 'lucide-react-native';
import type { ComponentType } from 'react';
import Discover from '@/screens/discover/Discover';
import Bookings from '@/screens/booking/Bookings';
import ChatList from '@/screens/chat/ChatList';
import ProfileHome from '@/screens/profile/ProfileHome';
import { palettes } from '@/theme/colors';
import { useThemeMode } from '@/theme/ThemeProvider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IOSFloatingTabBar, useIOSTheme } from '@/components/ios';

const Tab = createBottomTabNavigator();
const usesFloatingTabBar = Platform.OS === 'ios' || Platform.OS === 'android';

type IconProps = {
  color?: string;
  size?: number;
  strokeWidth?: number;
};

type TabOptionConfig = {
  label: string;
  Icon: ComponentType<IconProps>;
};

function createTabOptions({ label, Icon }: TabOptionConfig): BottomTabNavigationOptions {
  return {
    tabBarLabel: label,
    tabBarIcon: ({ color, size }) => <Icon size={size} color={color} />,
  };
}

export default function TabNavigator() {
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const iosTheme = useIOSTheme();
  const insets = useSafeAreaInsets();
  const tabBarBottomPadding = Math.max(insets.bottom, 16);
  const tabBarHeight = 60 + tabBarBottomPadding;

  return (
    <Tab.Navigator
      initialRouteName="Discover"
      tabBar={usesFloatingTabBar ? (props) => <IOSFloatingTabBar {...props} /> : undefined}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: usesFloatingTabBar ? iosTheme.colors.primary : scheme === 'dark' ? colors.secondary : colors.primary,
        tabBarInactiveTintColor: usesFloatingTabBar ? iosTheme.colors.textMuted : scheme === 'dark' ? colors.muted : '#9CA3AF',
        tabBarStyle: usesFloatingTabBar
          ? {
              position: 'absolute',
              backgroundColor: 'transparent',
              borderTopWidth: 0,
              elevation: 0,
            }
          : {
              backgroundColor: scheme === 'dark' ? colors.bg : '#ffffff',
              borderTopWidth: 1,
              borderTopColor: colors.border,
              paddingBottom: tabBarBottomPadding,
              paddingTop: 8,
              height: tabBarHeight,
            },
        tabBarLabelStyle: usesFloatingTabBar
          ? undefined
          : {
              fontSize: 12,
              fontWeight: '600',
            },
      }}
    >
      <Tab.Screen
        name="Discover"
        component={Discover}
        options={createTabOptions({ label: 'Discover', Icon: Search })}
      />
      <Tab.Screen
        name="Bookings"
        component={Bookings}
        options={createTabOptions({ label: 'Bookings', Icon: Calendar })}
      />
      <Tab.Screen
        name="Chat"
        component={ChatList}
        options={createTabOptions({ label: 'Chat', Icon: MessageCircle })}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileHome}
        options={createTabOptions({ label: 'Profile', Icon: User })}
      />
    </Tab.Navigator>
  );
}
