import { Text, TouchableOpacity, View, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';
import type { ComponentType } from 'react';
import { ArrowRight } from 'lucide-react-native';
import { useIOSTheme } from './iosTheme';

type IconProps = {
  color?: string;
  size?: number;
  strokeWidth?: number;
};

type IOSActionCardProps = {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  icon?: ComponentType<IconProps>;
  onPress?: (event: GestureResponderEvent) => void;
  dark?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

export default function IOSActionCard({
  title,
  subtitle,
  actionLabel,
  icon: Icon,
  onPress,
  dark = false,
  compact = false,
  style,
}: IOSActionCardProps) {
  const iosTheme = useIOSTheme();
  const backgroundColor = dark ? iosTheme.colors.primaryDeep : iosTheme.colors.surface;
  const foreground = dark ? iosTheme.colors.inverseText : iosTheme.colors.text;
  const secondary = dark ? iosTheme.colors.inverseTextSecondary : iosTheme.colors.textSecondary;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.88}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={[
        {
          backgroundColor,
          borderRadius: iosTheme.radius.xl,
          borderWidth: 1,
          borderColor: dark ? iosTheme.colors.inverseSurfaceBorder : iosTheme.colors.border,
          padding: compact ? iosTheme.spacing.lg : iosTheme.spacing.xl,
          minHeight: compact ? 82 : 118,
          flexDirection: 'row',
          alignItems: 'center',
          gap: compact ? iosTheme.spacing.md : iosTheme.spacing.lg,
          overflow: 'hidden',
        },
        iosTheme.shadows.card,
        style,
      ]}
    >
      {Icon ? (
        <View
          style={{
            width: compact ? 38 : 54,
            height: compact ? 38 : 54,
            borderRadius: compact ? 14 : 20,
            backgroundColor: dark ? iosTheme.colors.inverseSurface : iosTheme.colors.surfaceAlt,
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon size={compact ? 18 : 24} color={dark ? iosTheme.colors.inverseText : iosTheme.colors.primary} strokeWidth={2.25} />
        </View>
      ) : null}

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{ color: foreground, fontSize: compact ? 14 : 20, lineHeight: compact ? 19 : 26, fontWeight: '900' }}
          numberOfLines={compact ? 2 : undefined}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={{ color: secondary, fontSize: compact ? 12 : 14, lineHeight: compact ? 16 : 21, marginTop: iosTheme.spacing.xs }}
            numberOfLines={compact ? 1 : undefined}
          >
            {subtitle}
          </Text>
        ) : null}
        {actionLabel ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: iosTheme.spacing.md }}>
            <Text style={{ color: foreground, fontSize: 13, fontWeight: '800' }}>{actionLabel}</Text>
            <ArrowRight size={15} color={foreground} strokeWidth={2.5} />
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}
