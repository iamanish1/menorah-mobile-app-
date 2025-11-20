import { TouchableOpacity, Text } from "react-native";
import { styles, colors } from "@/styles/theme";

export default function CategoryPill({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        marginRight: 12,
        backgroundColor: selected ? colors.brand.primary : colors.bg.base,
        borderWidth: selected ? 0 : 1,
        borderColor: colors.border
      }}
    >
      <Text style={{
        color: selected ? colors.text.invert : colors.text.base,
        fontWeight: selected ? '600' : '500'
      }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}
