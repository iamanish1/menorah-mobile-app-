import { TouchableOpacity, View } from 'react-native';
import type { ReactNode } from 'react';
import { Image } from 'expo-image';
import { Bell, Menu, MessageCircle } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import IOSBadge from './IOSBadge';
import { useIOSTheme } from './iosTheme';

type IOSDiscoverHeaderProps = {
  onMenuPress?: () => void;
  onNotificationsPress?: () => void;
  onChatPress?: () => void;
  unreadCount?: number;
};

function HeaderAction({
  children,
  onPress,
  accessibilityLabel,
}: {
  children: ReactNode;
  onPress?: () => void;
  accessibilityLabel: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.76}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={{
        width: 46,
        height: 46,
        borderRadius: 23,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}
    >
      {children}
    </TouchableOpacity>
  );
}

export default function IOSDiscoverHeader({
  onMenuPress,
  onNotificationsPress,
  onChatPress,
  unreadCount = 0,
}: IOSDiscoverHeaderProps) {
  const insets = useSafeAreaInsets();
  const iosTheme = useIOSTheme();
  const visibleUnreadCount = unreadCount > 99 ? '99+' : unreadCount;
  const iconColor = iosTheme.colors.primary;

  return (
    <View
      style={{
        paddingHorizontal: iosTheme.layout.screenPadding,
        paddingTop: insets.top + iosTheme.spacing.xl,
        paddingBottom: iosTheme.spacing.lg,
        backgroundColor: iosTheme.colors.background,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: iosTheme.spacing.sm }}>
          <Image
            source={require('../../../assets/brand/menorah-logo-no-bg.png')}
            style={{ width: 68, height: 68 }}
            contentFit="contain"
          />
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: iosTheme.spacing.xs,
            marginLeft: iosTheme.spacing.sm,
          }}
        >
          <HeaderAction onPress={onMenuPress} accessibilityLabel="Open menu">
            <Menu size={35} color={iconColor} strokeWidth={2.35} />
          </HeaderAction>

          <HeaderAction onPress={onNotificationsPress} accessibilityLabel="Open notifications">
            <Bell size={32} color={iconColor} strokeWidth={2.35} />
            {unreadCount > 0 ? (
              <IOSBadge
                label={visibleUnreadCount}
                style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  minWidth: 22,
                  height: 22,
                  borderRadius: 11,
                  borderColor: iosTheme.colors.background,
                }}
              />
            ) : null}
          </HeaderAction>

          <HeaderAction onPress={onChatPress} accessibilityLabel="Open chat">
            <MessageCircle size={32} color={iconColor} strokeWidth={2.35} />
          </HeaderAction>
        </View>
      </View>
    </View>
  );
}
