import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useIOSTheme } from './iosTheme';

type IOSBadgeProps = {
  label?: string | number;
  style?: StyleProp<ViewStyle>;
};

export default function IOSBadge({ label, style }: IOSBadgeProps) {
  const iosTheme = useIOSTheme();

  return (
    <View
      style={[
        {
          minWidth: label ? 18 : 10,
          height: label ? 18 : 10,
          borderRadius: iosTheme.radius.pill,
          backgroundColor: iosTheme.colors.danger,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: label ? 5 : 0,
          borderWidth: 2,
          borderColor: iosTheme.colors.badgeBorder,
        },
        style,
      ]}
    >
      {label ? (
        <Text style={{ color: iosTheme.colors.inverseText, fontSize: 10, fontWeight: '800' }}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}
