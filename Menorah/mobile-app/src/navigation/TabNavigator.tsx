import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Search, Calendar, MessageCircle, User } from 'lucide-react-native';
import Discover from '@/screens/discover/Discover';
import Bookings from '@/screens/booking/Bookings';
import ChatList from '@/screens/chat/ChatList';
import ProfileHome from '@/screens/profile/ProfileHome';
import { palettes } from '@/theme/colors';
import { useThemeMode } from '@/theme/ThemeProvider';

const Tab = createBottomTabNavigator();

export default function TabNavigator() {
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];

  return (
    <Tab.Navigator
      initialRouteName="Discover"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: scheme === 'dark' ? colors.secondary : colors.primary,
        tabBarInactiveTintColor: scheme === 'dark' ? colors.muted : '#9CA3AF',
        tabBarStyle: {
          backgroundColor: scheme === 'dark' ? '#0c1511' : '#ffffff',
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingBottom: 10,
          paddingTop: 8,
          height: 64,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
      }}
    >
      <Tab.Screen
        name="Discover"
        component={Discover}
        options={{
          tabBarLabel: 'Discover',
          tabBarIcon: ({ color, size }) => <Search size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Bookings"
        component={Bookings}
        options={{
          tabBarLabel: 'Bookings',
          tabBarIcon: ({ color, size }) => <Calendar size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Chat"
        component={ChatList}
        options={{
          tabBarLabel: 'Chat',
          tabBarIcon: ({ color, size }) => <MessageCircle size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileHome}
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color, size }) => <User size={size} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}
