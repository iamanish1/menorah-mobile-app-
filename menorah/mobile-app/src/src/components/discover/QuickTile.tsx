import { Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useThemeMode } from "@/theme/ThemeProvider";
import { palettes } from "@/theme/colors";

export default function QuickTile({
  title,
  subtitle,
  image,
  onPress,
  width = 220,
  height = 130,
}: {
  title: string;
  subtitle?: string;
  image: string;
  onPress?: () => void;
  width?: number;
  height?: number;
}) {
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];

  return (
    <Pressable onPress={onPress} style={{ width, height }}>
      <View style={{ 
        borderRadius: 20, 
        overflow: 'hidden', 
        borderWidth: 1, 
        borderColor: colors.border,
        flex: 1 
      }}>
        <Image source={{ uri: image }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
        <LinearGradient 
          colors={["rgba(0,0,0,0.05)", "rgba(0,0,0,0.55)"]} 
          style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} 
        />
        <View style={{ position: "absolute", left: 12, right: 12, bottom: 12 }}>
          {!!subtitle && (
            <Text style={{ 
              color: 'rgba(255, 255, 255, 0.9)', 
              fontSize: 12,
              marginBottom: 4
            }}>
              {subtitle}
            </Text>
          )}
          <Text style={{ 
            fontSize: 16, 
            fontWeight: '600',
            color: 'white'
          }}>
            {title}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
