import { TouchableOpacity, Text, View } from "react-native";
import { styles, colors } from "@/styles/theme";

export default function QuickAction({
  title,
  subtitle,
  onPress,
}: {
  title: string;
  subtitle?: string;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity 
      onPress={onPress} 
      style={{
        flex: 1,
        backgroundColor: colors.bg.base,
        borderRadius: 20,
        padding: 16,
        marginRight: 12,
        borderWidth: 1,
        borderColor: colors.border
      }}
    >
      {subtitle && <Text style={[styles.textCaption, { color: colors.text.muted }]}>{subtitle}</Text>}
      <Text style={[styles.textBody, { fontWeight: '600', marginTop: 4 }]}>
        {title}
      </Text>
    </TouchableOpacity>
  );
}
