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
import { SafeAreaView, useSafeAreaInsets, type Edge } from 'react-native-safe-area-context';
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
  const insets = useSafeAreaInsets();
  // tab bar is 74px tall; bottom offset = insets.bottom + 16 (or just 16 when no inset)
  const tabBarClearance = 74 + Math.max(insets.bottom, 16) + 24;

  const body = scroll ? (
    <Animated.ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[
        {
          paddingHorizontal: iosTheme.layout.screenPadding,
          paddingBottom: tabBarClearance,
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
