import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { ReactNode } from 'react';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { useIOSTheme } from './iosTheme';

type IOSScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  keyboardAvoiding?: boolean;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  keyboardShouldPersistTaps?: ScrollViewProps['keyboardShouldPersistTaps'];
  onScroll?: ScrollViewProps['onScroll'];
  scrollEventThrottle?: ScrollViewProps['scrollEventThrottle'];
  edges?: Edge[];
};

export default function IOSScreen({
  children,
  scroll = true,
  keyboardAvoiding = false,
  style,
  contentContainerStyle,
  keyboardShouldPersistTaps,
  onScroll,
  scrollEventThrottle,
  edges = ['top', 'right', 'bottom', 'left'],
}: IOSScreenProps) {
  const iosTheme = useIOSTheme();

  const body = scroll ? (
    <Animated.ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[
        {
          paddingHorizontal: iosTheme.layout.screenPadding,
          paddingBottom: 132,
        },
        contentContainerStyle,
      ]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      onScroll={onScroll}
      scrollEventThrottle={scrollEventThrottle}
    >
      {children}
    </Animated.ScrollView>
  ) : (
    <View style={[{ flex: 1, paddingHorizontal: iosTheme.layout.screenPadding }, contentContainerStyle]}>
      {children}
    </View>
  );

  return (
    <SafeAreaView edges={edges} style={[{ flex: 1, backgroundColor: iosTheme.colors.background }, style]}>
      {keyboardAvoiding ? (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
    </SafeAreaView>
  );
}
