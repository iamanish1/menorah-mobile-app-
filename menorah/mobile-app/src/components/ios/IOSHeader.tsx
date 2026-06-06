import { Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Bell, Menu } from 'lucide-react-native';
import type { ComponentType } from 'react';
import IOSIconButton from './IOSIconButton';
import { iosTheme } from './iosTheme';

type IconProps = {
  color?: string;
  size?: number;
  strokeWidth?: number;
};

type IOSHeaderProps = {
  title?: string;
  subtitle?: string;
  showWordmark?: boolean;
  onMenuPress?: () => void;
  onRightPress?: () => void;
  rightIcon?: ComponentType<IconProps>;
  badgeCount?: number;
};

export default function IOSHeader({
  title = 'Menorah',
  subtitle,
  showWordmark = true,
  onMenuPress,
  onRightPress,
  rightIcon: RightIcon = Bell,
  badgeCount = 0,
}: IOSHeaderProps) {
  return (
    <View
      style={{
        paddingHorizontal: iosTheme.layout.screenPadding,
        paddingTop: iosTheme.spacing.sm,
        paddingBottom: iosTheme.spacing.lg,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <IOSIconButton icon={Menu} onPress={onMenuPress} accessibilityLabel="Open menu" />

      <View style={{ alignItems: 'center', flex: 1, paddingHorizontal: iosTheme.spacing.lg }}>
        {showWordmark ? (
          <Image
            source={require('../../../assets/brand/wordmark-dark.png')}
            style={{ width: 144, height: 34, marginBottom: subtitle ? 2 : 0 }}
            contentFit="contain"
          />
        ) : (
          <Text
            style={{
              fontSize: 24,
              lineHeight: 30,
              fontWeight: '900',
              color: iosTheme.colors.primary,
            }}
          >
            {title}
          </Text>
        )}
        {subtitle ? (
          <Text
            style={{
              fontSize: 12,
              lineHeight: 16,
              color: iosTheme.colors.textSecondary,
              fontWeight: '700',
            }}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>

      <IOSIconButton
        icon={RightIcon}
        onPress={onRightPress}
        accessibilityLabel="Open notifications"
        badge={badgeCount > 0}
        badgeLabel={badgeCount > 9 ? '9+' : badgeCount}
      />
    </View>
  );
}
