import { View, Text } from "react-native";
import { Image } from "expo-image";
import { styles, colors } from "@/styles/theme";

export default function ChatCTA() {
  return (
    <View style={[styles.px4, { marginTop: 12 }]}>
      <View style={{
        backgroundColor: colors.brand.primary,
        borderRadius: 24,
        paddingHorizontal: 20,
        paddingVertical: 20,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderWidth: 1,
        borderColor: colors.brand.primary + 'B3'
      }}>
        <View style={{ flex: 1, paddingRight: 16 }}>
          <Text style={{ 
            color: 'white', 
            fontSize: 22, 
            fontWeight: '600',
            marginBottom: 4
          }}>
            Chat with us
          </Text>
          <Text style={{ 
            color: 'rgba(255, 255, 255, 0.9)',
            fontSize: 14,
            lineHeight: 20
          }}>
            Speak with a trained clinical psychology student or another man just like you in a safe space.
          </Text>
        </View>
        <View style={{
          width: 72,
          height: 72,
          borderRadius: 36,
          backgroundColor: 'rgba(255, 255, 255, 0.15)',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden'
        }}>
          <Image
            source={{ uri: "https://images.unsplash.com/photo-1541532713592-79a0317b6b77?q=80&w=400&auto=format&fit=crop" }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
          />
        </View>
      </View>
    </View>
  );
}
