import { TouchableOpacity, Text } from "react-native";
import { styles } from "@/styles/theme";
import { useThemeMode } from "@/theme/ThemeProvider";
import { palettes } from "@/theme/colors";

export default function QuickAction({
  title,
  subtitle,
  onPress,
}: {
  title: string;
  subtitle?: string;
  onPress?: () => void;
}) {
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];

  return (
    <TouchableOpacity 
      onPress={onPress} 
      style={{
        flex: 1,
        backgroundColor: colors.card,
        borderRadius: 20,
        padding: 16,
        marginRight: 12,
        borderWidth: 1,
        borderColor: colors.border
      }}
    >
      {subtitle && <Text style={[styles.textCaption, { color: colors.muted }]}>{subtitle}</Text>}
      <Text style={[styles.textBody, { color: colors.text, fontWeight: '600', marginTop: 4 }]}>
        {title}
      </Text>
    </TouchableOpacity>
  );
}
