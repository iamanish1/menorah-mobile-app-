import { TouchableOpacity, Text } from "react-native";
import { useThemeMode } from "@/theme/ThemeProvider";
import { palettes } from "@/theme/colors";

export default function CategoryPill({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];

  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        marginRight: 12,
        backgroundColor: selected ? colors.primary : colors.card,
        borderWidth: selected ? 0 : 1,
        borderColor: colors.border
      }}
    >
      <Text style={{
        color: selected ? 'white' : colors.text,
        fontWeight: selected ? '600' : '500'
      }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}
