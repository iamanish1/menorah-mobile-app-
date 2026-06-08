import { View, Text, TouchableOpacity } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useThemeMode } from "@/theme/ThemeProvider";
import { palettes } from "@/theme/colors";

export default function HeroBanner() {
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];

  return (
    <View style={{ paddingHorizontal: 16, marginBottom: 4 }}>
      <TouchableOpacity>
        <View style={{
          borderRadius: 20,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card
        }}>
          <Image
            source={{ uri: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?q=80&w=1200&auto=format&fit=crop" }}
            style={{ width: "100%", height: 220 }}
            contentFit="cover"
          />
          <LinearGradient
            colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.55)']}
            style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
          />
          <View style={{ 
            position: "absolute", 
            left: 16, 
            right: 16, 
            top: 0,
            bottom: 0,
            justifyContent: 'center',
            alignItems: 'center'
          }}>
            <Text style={{
              fontSize: 24,
              fontWeight: '700',
              color: 'white',
              textAlign: 'center',
              lineHeight: 32
            }}>
              Mind Over Matter,{'\n'}Redefined
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
}
