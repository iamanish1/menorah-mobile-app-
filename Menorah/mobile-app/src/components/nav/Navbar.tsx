import React from "react";
import { View, Pressable, Image, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from 'expo-linear-gradient';
import { Bell, LifeBuoy, Sun, Moon } from "lucide-react-native";
import { useThemeMode } from "@/theme/ThemeProvider";

export default function Navbar({
  onHelp,
  onBell,
}: {
  onHelp?: () => void;
  onBell?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { scheme, toggle } = useThemeMode();
  const baseStyle = {
    paddingTop: Math.max(insets.top, 12),
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  } as const;

  const lightActionBg = 'rgba(0, 0, 0, 0.07)';
  const lightIcon = '#151a16';

  // Both modes: plain container (inherits creamy background from parent)
  return (
    <View style={baseStyle}>
      {/* Logo - Left side (full size) */}
      <View style={{ flex: 1, alignItems: 'flex-start' }}>
        <Image 
          source={require("../../../assets/brand/menorah_logo.png")}
          resizeMode="contain" 
          style={{ 
            width: 180, 
            height: 60,
            alignSelf: 'flex-start',
            marginLeft:-10,
            flexShrink: 1
          }}
          onError={() => {
            console.log('Logo image failed to load');
          }}
        />
      </View>

      {/* Action buttons - Right side (light) */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pressable
          onPress={toggle}
          style={{
            backgroundColor: lightActionBg,
            borderRadius: 20,
            padding: 8,
            width: 36,
            height: 36,
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {scheme === 'dark' ? <Sun size={18} color={lightIcon} /> : <Moon size={18} color={lightIcon} />}
        </Pressable>
        
        <Pressable
          onPress={onBell}
          style={{
            backgroundColor: lightActionBg,
            borderRadius: 20,
            padding: 8,
            width: 36,
            height: 36,
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Bell size={18} color={lightIcon} />
        </Pressable>
        
        <Pressable
          onPress={onHelp}
          style={{
            backgroundColor: lightActionBg,
            borderRadius: 20,
            paddingHorizontal: 12,
            paddingVertical: 8,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6
          }}
        >
          <LifeBuoy size={16} color={lightIcon} />
          <Text style={{ color: lightIcon, fontWeight: '600', fontSize: 14 }}>Help</Text>
        </Pressable>
      </View>
    </View>
  );
}
