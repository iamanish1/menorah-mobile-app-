import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { ReactNode } from 'react';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { iosTheme } from './iosTheme';

type IOSScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  keyboardAvoiding?: boolean;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  keyboardShouldPersistTaps?: ScrollViewProps['keyboardShouldPersistTaps'];
  edges?: Edge[];
};

export default function IOSScreen({
  children,
  scroll = true,
  keyboardAvoiding = false,
  style,
  contentContainerStyle,
  keyboardShouldPersistTaps,
  edges = ['top', 'right', 'bottom', 'left'],
}: IOSScreenProps) {
  const body = scroll ? (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[
        {
          paddingHorizontal: iosTheme.layout.screenPadding,
          paddingBottom: iosTheme.spacing.xxxl + iosTheme.spacing.md,
        },
        contentContainerStyle,
      ]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
    >
      {children}
    </ScrollView>
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
