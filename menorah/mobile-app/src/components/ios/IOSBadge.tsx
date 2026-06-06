import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { iosTheme } from './iosTheme';

type IOSBadgeProps = {
  label?: string | number;
  style?: StyleProp<ViewStyle>;
};

export default function IOSBadge({ label, style }: IOSBadgeProps) {
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
          borderColor: iosTheme.colors.white,
        },
        style,
      ]}
    >
      {label ? (
        <Text style={{ color: iosTheme.colors.white, fontSize: 10, fontWeight: '800' }}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}
