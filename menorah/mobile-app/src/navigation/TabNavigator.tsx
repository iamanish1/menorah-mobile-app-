import React from 'react';
import { createBottomTabNavigator, type BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
import { Search, Calendar, MessageCircle, User } from 'lucide-react-native';
import type { ComponentType } from 'react';
import Discover from '@/screens/discover/Discover';
import Bookings from '@/screens/booking/Bookings';
import ChatList from '@/screens/chat/ChatList';
import ProfileHome from '@/screens/profile/ProfileHome';
import { IOSFloatingTabBar, useIOSTheme } from '@/components/ios';

const Tab = createBottomTabNavigator();

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
  const iosTheme = useIOSTheme();

  return (
    <Tab.Navigator
      initialRouteName="Discover"
      tabBar={(props) => <IOSFloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: iosTheme.colors.primary,
        tabBarInactiveTintColor: iosTheme.colors.textMuted,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          elevation: 0,
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
