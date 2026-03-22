import React from "react";
import { View, Pressable, Image, Text, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Bell, LifeBuoy, Sun, Moon } from "lucide-react-native";
import { useThemeMode } from "@/theme/ThemeProvider";
import { palettes } from "@/theme/colors";

export default function Navbar({
  onHelp,
  onBell,
  unreadCount = 0,
}: {
  onHelp?: () => void;
  onBell?: () => void;
  unreadCount?: number;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { scheme, toggle } = useThemeMode();
  const colors = palettes[scheme];
  const isCompact = width < 390;
  const actionSize = isCompact ? 40 : 44;
  const logoWidth = Math.min(180, Math.max(128, width - (isCompact ? 212 : 234)));
  const helpHorizontalPadding = isCompact ? 10 : 12;
  const helpLabelSize = isCompact ? 13 : 14;
  const baseStyle = {
    paddingTop: Math.max(insets.top, 12),
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between'
  } as const;

  const actionBg = scheme === 'dark' ? 'rgba(246, 242, 232, 0.08)' : 'rgba(0, 0, 0, 0.07)';
  const actionBorder = scheme === 'dark' ? 'rgba(246, 242, 232, 0.07)' : 'transparent';
  const actionIcon = scheme === 'dark' ? colors.text : '#151a16';

  // Both modes: plain container (inherits creamy background from parent)
  return (
    <View style={baseStyle}>
      <View style={{ flex: 1, minWidth: 0, paddingRight: 10 }}>
        <Image 
          source={require("../../../assets/brand/menorah_logo.png")}
          resizeMode="contain" 
          style={{ 
            width: logoWidth,
            height: isCompact ? 44 : 48,
            alignSelf: 'flex-start',
            flexShrink: 1
          }}
          onError={() => {
            console.log('Logo image failed to load');
          }}
        />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: isCompact ? 6 : 8, flexShrink: 0 }}>
        <Pressable
          onPress={toggle}
          style={{
            backgroundColor: actionBg,
            borderWidth: 1,
            borderColor: actionBorder,
            borderRadius: actionSize / 2,
            padding: 8,
            width: actionSize,
            height: actionSize,
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {scheme === 'dark' ? <Sun size={18} color={actionIcon} /> : <Moon size={18} color={actionIcon} />}
        </Pressable>
        
        <Pressable
          onPress={onBell}
          style={{
            backgroundColor: actionBg,
            borderWidth: 1,
            borderColor: actionBorder,
            borderRadius: actionSize / 2,
            padding: 8,
            width: actionSize,
            height: actionSize,
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Bell size={18} color={actionIcon} />
          {unreadCount > 0 ? (
            <View
              style={{
                position: 'absolute',
                top: 6,
                right: 6,
                minWidth: 16,
                height: 16,
                borderRadius: 8,
                backgroundColor: '#EF4444',
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 3,
              }}
            >
              <Text style={{ color: 'white', fontSize: 10, fontWeight: '700' }}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </Text>
            </View>
          ) : null}
        </Pressable>
        
        <Pressable
          onPress={onHelp}
          style={{
            backgroundColor: actionBg,
            borderWidth: 1,
            borderColor: actionBorder,
            borderRadius: actionSize / 2,
            paddingHorizontal: helpHorizontalPadding,
            height: actionSize,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6
          }}
        >
          <LifeBuoy size={16} color={actionIcon} />
          <Text
            numberOfLines={1}
            style={{ color: actionIcon, fontWeight: '600', fontSize: helpLabelSize }}
          >
            Help
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
