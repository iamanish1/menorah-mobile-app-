import { TouchableOpacity, View, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';
import { iosTheme } from './iosTheme';

type IOSCardProps = {
  children: ReactNode;
  onPress?: (event: GestureResponderEvent) => void;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
};

export default function IOSCard({ children, onPress, style, contentStyle }: IOSCardProps) {
  const Container = onPress ? TouchableOpacity : View;

  return (
    <Container
      onPress={onPress}
      activeOpacity={onPress ? 0.88 : undefined}
      style={[
        {
          backgroundColor: iosTheme.colors.surface,
          borderRadius: iosTheme.radius.xl,
          borderWidth: 1,
          borderColor: iosTheme.colors.border,
          overflow: 'hidden',
        },
        iosTheme.shadows.card,
        style,
      ]}
    >
      <View style={[{ padding: iosTheme.spacing.xl }, contentStyle]}>{children}</View>
    </Container>
  );
}
