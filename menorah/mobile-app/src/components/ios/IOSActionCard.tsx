import { Text, TouchableOpacity, View, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';
import type { ComponentType } from 'react';
import { ArrowRight } from 'lucide-react-native';
import { iosTheme } from './iosTheme';

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
  const backgroundColor = dark ? iosTheme.colors.primaryDeep : iosTheme.colors.surface;
  const foreground = dark ? iosTheme.colors.white : iosTheme.colors.text;
  const secondary = dark ? 'rgba(255,255,255,0.78)' : iosTheme.colors.textSecondary;

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
          borderColor: dark ? 'rgba(255,255,255,0.10)' : iosTheme.colors.border,
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
            width: compact ? 46 : 54,
            height: compact ? 46 : 54,
            borderRadius: compact ? 17 : 20,
            backgroundColor: dark ? 'rgba(255,255,255,0.13)' : iosTheme.colors.surfaceAlt,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon size={compact ? 21 : 24} color={dark ? iosTheme.colors.white : iosTheme.colors.primary} strokeWidth={2.25} />
        </View>
      ) : null}

      <View style={{ flex: 1 }}>
        <Text style={{ color: foreground, fontSize: compact ? 16 : 20, lineHeight: compact ? 22 : 26, fontWeight: '900' }}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ color: secondary, fontSize: compact ? 13 : 14, lineHeight: compact ? 18 : 21, marginTop: iosTheme.spacing.xs }}>
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
