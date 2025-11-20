import { Pressable, View, Text } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as Linking from "expo-linking";
import { useThemeMode } from "@/theme/ThemeProvider";
import { palettes } from "@/theme/colors";

export type InstaPost = { id: string; image: string; url: string };

export default function InstaPostCard({ item }: { item: InstaPost }) {
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];

  return (
    <Pressable onPress={() => Linking.openURL(item.url)} style={{ width: 220, height: 160, marginRight: 16 }}>
      <View style={{ 
        borderRadius: 20, 
        overflow: 'hidden', 
        borderWidth: 1, 
        borderColor: colors.border,
        flex: 1 
      }}>
        <Image source={{ uri: item.image }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
        <LinearGradient 
          colors={["transparent", "rgba(0,0,0,0.55)"]} 
          style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} 
        />
        <View style={{ position: "absolute", left: 10, bottom: 10 }}>
          <Text style={{ 
            color: 'rgba(255, 255, 255, 0.85)', 
            fontSize: 12 
          }}>
            Instagram
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
