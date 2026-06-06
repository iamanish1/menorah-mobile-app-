import { TouchableOpacity, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';
import type { ComponentType } from 'react';
import { iosTheme } from './iosTheme';
import IOSBadge from './IOSBadge';

type IconProps = {
  color?: string;
  size?: number;
  strokeWidth?: number;
};

type IOSIconButtonProps = {
  icon: ComponentType<IconProps>;
  onPress?: (event: GestureResponderEvent) => void;
  accessibilityLabel: string;
  badge?: boolean;
  badgeLabel?: string | number;
  color?: string;
  backgroundColor?: string;
  style?: StyleProp<ViewStyle>;
};

export default function IOSIconButton({
  icon: Icon,
  onPress,
  accessibilityLabel,
  badge = false,
  badgeLabel,
  color = iosTheme.colors.primary,
  backgroundColor = iosTheme.colors.surface,
  style,
}: IOSIconButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.82}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[
        {
          width: 46,
          height: 46,
          borderRadius: 23,
          backgroundColor,
          borderWidth: 1,
          borderColor: iosTheme.colors.border,
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        },
        iosTheme.shadows.card,
        style,
      ]}
    >
      <Icon size={20} color={color} strokeWidth={2.25} />
      {badge ? (
        <IOSBadge
          label={badgeLabel}
          style={{
            position: 'absolute',
            top: -3,
            right: -3,
          }}
        />
      ) : null}
    </TouchableOpacity>
  );
}
