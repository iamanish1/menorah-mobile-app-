import { Text, TouchableOpacity, View } from 'react-native';
import type { ComponentType } from 'react';
import { ChevronRight } from 'lucide-react-native';
import { iosTheme } from './iosTheme';

type IconProps = {
  color?: string;
  size?: number;
  strokeWidth?: number;
};

type IOSListItemProps = {
  title: string;
  subtitle?: string;
  icon?: ComponentType<IconProps>;
  onPress?: () => void;
  danger?: boolean;
  showDivider?: boolean;
};

export default function IOSListItem({
  title,
  subtitle,
  icon: Icon,
  onPress,
  danger = false,
  showDivider = true,
}: IOSListItemProps) {
  const accent = danger ? iosTheme.colors.danger : iosTheme.colors.primary;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.82}
      disabled={!onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 68,
        paddingVertical: iosTheme.spacing.md,
        borderBottomWidth: showDivider ? 1 : 0,
        borderBottomColor: iosTheme.colors.hairline,
      }}
    >
      {Icon ? (
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: iosTheme.radius.md,
            backgroundColor: danger ? '#FCECEB' : iosTheme.colors.surfaceAlt,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: iosTheme.spacing.md,
          }}
        >
          <Icon size={20} color={accent} strokeWidth={2.2} />
        </View>
      ) : null}

      <View style={{ flex: 1 }}>
        <Text style={{ color: danger ? iosTheme.colors.danger : iosTheme.colors.text, fontSize: 15, lineHeight: 20, fontWeight: '800' }}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ color: iosTheme.colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 2 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <ChevronRight size={18} color={danger ? iosTheme.colors.danger : iosTheme.colors.textMuted} strokeWidth={2.4} />
    </TouchableOpacity>
  );
}
