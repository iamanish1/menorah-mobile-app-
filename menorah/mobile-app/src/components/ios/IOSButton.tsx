import { ActivityIndicator, Text, TouchableOpacity, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';
import type { ComponentType } from 'react';
import { iosTheme } from './iosTheme';

type IconProps = {
  color?: string;
  size?: number;
  strokeWidth?: number;
};

type IOSButtonProps = {
  title: string;
  onPress?: (event: GestureResponderEvent) => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
  iconEnd?: ComponentType<IconProps>;
  style?: StyleProp<ViewStyle>;
};

export default function IOSButton({
  title,
  onPress,
  disabled = false,
  loading = false,
  variant = 'primary',
  iconEnd: IconEnd,
  style,
}: IOSButtonProps) {
  const isPrimary = variant === 'primary';
  const isGhost = variant === 'ghost';
  const backgroundColor = isPrimary
    ? iosTheme.colors.primary
    : isGhost
      ? 'transparent'
      : iosTheme.colors.surfaceAlt;
  const textColor = isPrimary ? iosTheme.colors.white : iosTheme.colors.primary;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.86}
      accessibilityRole="button"
      style={[
        {
          minHeight: 56,
          borderRadius: iosTheme.radius.lg,
          backgroundColor,
          borderWidth: isGhost ? 0 : 1,
          borderColor: isPrimary ? iosTheme.colors.primary : iosTheme.colors.border,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: iosTheme.spacing.sm,
          opacity: disabled ? 0.55 : 1,
          paddingHorizontal: iosTheme.spacing.xl,
        },
        isPrimary ? iosTheme.shadows.button : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} size="small" />
      ) : (
        <>
          <Text style={{ color: textColor, fontSize: 16, fontWeight: '800' }}>{title}</Text>
          {IconEnd ? <IconEnd size={18} color={textColor} strokeWidth={2.3} /> : null}
        </>
      )}
    </TouchableOpacity>
  );
}
