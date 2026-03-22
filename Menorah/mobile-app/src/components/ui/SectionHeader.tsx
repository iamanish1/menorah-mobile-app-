import { View, Text, TouchableOpacity } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { useThemeMode } from "@/theme/ThemeProvider";
import { palettes } from "@/theme/colors";

interface SectionHeaderProps {
  title: string;
  onPress?: () => void;
  showChevron?: boolean;
  style?: any;
  titleStyle?: any;
}

export default function SectionHeader({ title, onPress, showChevron = true, style, titleStyle }: SectionHeaderProps) {
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];

  return (
    <View style={[{
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      marginBottom: 12,
      marginTop: 8
    }, style]}>
      <Text style={[{ 
        fontSize: 20, 
        fontWeight: '700', 
        color: colors.text,
        flexShrink: 1
      }, titleStyle]}>
        {title}
      </Text>
      
      {onPress && (
        <TouchableOpacity onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 12 }}>
          <Text style={{ 
            fontSize: 14, 
            color: colors.primary, 
            fontWeight: '600',
            marginRight: 4
          }}>
            See all
          </Text>
          {showChevron && <ChevronRight size={16} color={colors.primary} />}
        </TouchableOpacity>
      )}
    </View>
  );
}
