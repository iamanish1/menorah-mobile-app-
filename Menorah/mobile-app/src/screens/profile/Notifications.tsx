import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Bell, MessageCircle, CalendarClock, Sparkles } from 'lucide-react-native';
import { useThemeMode } from '@/theme/ThemeProvider';
import { palettes } from '@/theme/colors';
import { AppNotification, useNotifications } from '@/state/useNotifications';

const formatTime = (timestamp: string) => {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
};

const getNotificationIcon = (notification: AppNotification, color: string) => {
  switch (notification.type) {
    case 'message':
      return <MessageCircle size={20} color={color} />;
    case 'session':
    case 'booking':
      return <CalendarClock size={20} color={color} />;
    default:
      return <Sparkles size={20} color={color} />;
  }
};

export default function Notifications({ navigation }: any) {
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const { notifications, unreadCount, markAllAsRead, clearAll, openNotification } = useNotifications();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View
        style={{
          backgroundColor: colors.card,
          paddingHorizontal: 16,
          paddingVertical: 16,
          borderBottomLeftRadius: 24,
          borderBottomRightRadius: 24,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: colors.bg,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 12,
            }}
          >
            <ArrowLeft size={20} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 24, fontWeight: '700', color: colors.cardText }}>
              Notifications
            </Text>
            <Text style={{ fontSize: 14, color: colors.muted, marginTop: 2 }}>
              {unreadCount > 0 ? `${unreadCount} unread updates` : 'You are all caught up'}
            </Text>
          </View>
        </View>

        {(notifications.length > 0) && (
          <View style={{ flexDirection: 'row', marginTop: 16, gap: 12 }}>
            <TouchableOpacity
              onPress={markAllAsRead}
              style={{
                flex: 1,
                backgroundColor: colors.bg,
                borderRadius: 14,
                paddingVertical: 12,
                alignItems: 'center',
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text style={{ color: colors.cardText, fontSize: 14, fontWeight: '600' }}>
                Mark all read
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={clearAll}
              style={{
                flex: 1,
                backgroundColor: colors.bg,
                borderRadius: 14,
                paddingVertical: 12,
                alignItems: 'center',
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text style={{ color: colors.cardText, fontSize: 14, fontWeight: '600' }}>
                Clear all
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {notifications.length === 0 ? (
          <View
            style={{
              marginTop: 48,
              alignItems: 'center',
              paddingHorizontal: 20,
            }}
          >
            <View
              style={{
                width: 88,
                height: 88,
                borderRadius: 44,
                backgroundColor: colors.card,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Bell size={36} color={colors.muted} />
            </View>
            <Text style={{ fontSize: 22, fontWeight: '700', color: colors.text, marginTop: 20 }}>
              No notifications yet
            </Text>
            <Text style={{ fontSize: 15, color: colors.muted, textAlign: 'center', marginTop: 8, lineHeight: 22 }}>
              Booking updates, session alerts, and new messages will appear here.
            </Text>
          </View>
        ) : (
          notifications.map((notification) => (
            <TouchableOpacity
              key={notification.id}
              onPress={() => openNotification(notification)}
              style={{
                backgroundColor: colors.card,
                borderRadius: 18,
                padding: 16,
                marginBottom: 12,
                borderWidth: 1,
                borderColor: notification.read ? colors.border : colors.primary,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: `${colors.primary}18`,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 12,
                  }}
                >
                  {getNotificationIcon(notification, colors.primary)}
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: colors.cardText, flex: 1, paddingRight: 12 }}>
                      {notification.title}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.muted }}>
                      {formatTime(notification.createdAt)}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 14, color: colors.muted, lineHeight: 21, marginTop: 6 }}>
                    {notification.body}
                  </Text>
                  {notification.actionLabel ? (
                    <Text style={{ fontSize: 13, color: colors.primary, fontWeight: '600', marginTop: 10 }}>
                      {notification.actionLabel}
                    </Text>
                  ) : null}
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
