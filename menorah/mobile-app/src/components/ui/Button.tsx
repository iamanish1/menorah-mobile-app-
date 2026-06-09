import { Pressable, Text, ActivityIndicator, PressableProps, StyleProp, ViewStyle } from "react-native";
import { useThemeMode } from "@/theme/ThemeProvider";
import { palettes } from "@/theme/colors";

type Props = PressableProps & {
  title: string;
  loading?: boolean;
  variant?: "primary" | "outline" | "ghost";
  size?: "md" | "lg";
  style?: StyleProp<ViewStyle>;
};

export default function Button({
  title,
  loading = false,
  variant = "primary",
  size = "lg",
  style,
  ...rest
}: Props) {
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const primaryTextColor = scheme === 'dark' ? colors.primaryDark : 'white';

  const getButtonStyle = () => {
    const baseStyle = {
      borderRadius: 20,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    };

    const sizeStyle = size === "md" 
      ? { paddingVertical: 12, paddingHorizontal: 16 }
      : { paddingVertical: 16, paddingHorizontal: 24 };

    switch (variant) {
      case "outline":
        return {
          ...baseStyle,
          ...sizeStyle,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
        };
      case "ghost":
        return {
          ...baseStyle,
          ...sizeStyle,
          backgroundColor: 'transparent',
        };
      default:
        return {
          ...baseStyle,
          ...sizeStyle,
          backgroundColor: colors.primary,
        };
    }
  };

  const getTextStyle = () => {
    const baseStyle = {
      fontSize: 16,
      fontWeight: '600' as const,
    };

    switch (variant) {
      case "outline":
        return {
          ...baseStyle,
          color: colors.text,
        };
      case "ghost":
        return {
          ...baseStyle,
          color: colors.primary,
        };
      default:
        return {
          ...baseStyle,
          color: primaryTextColor,
        };
    }
  };

  return (
    <Pressable
      style={[
        getButtonStyle(),
        (loading || rest.disabled) && { opacity: 0.6 },
        style
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={variant === "outline" ? colors.text : primaryTextColor} />
      ) : (
        <Text style={getTextStyle()}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}
