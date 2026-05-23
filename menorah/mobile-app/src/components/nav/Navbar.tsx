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
  const actionSize = isCompact ? 36 : 40;
const helpHorizontalPadding = isCompact ? 8 : 10;
  const helpLabelSize = isCompact ? 12 : 13;
  const actionIconSize = isCompact ? 16 : 17;
  const helpIconSize = isCompact ? 14 : 15;
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
      <View style={{ flex: 1, minWidth: 0, paddingRight: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Image
          source={require("../../../assets/brand/menorah_logo.png")}
          resizeMode="cover"
          style={{
            width: isCompact ? 38 : 42,
            height: isCompact ? 38 : 42,
            borderRadius: isCompact ? 19 : 21,
          }}
        />
        <View>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: isCompact ? 15 : 16, letterSpacing: 0.3 }}>
            Menorah
          </Text>
          <Text style={{ color: colors.muted, fontSize: isCompact ? 10 : 11, fontWeight: '500' }}>
            Mind Over Matter
          </Text>
        </View>
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
          {scheme === 'dark' ? <Sun size={actionIconSize} color={actionIcon} /> : <Moon size={actionIconSize} color={actionIcon} />}
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
          <Bell size={actionIconSize} color={actionIcon} />
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
          <LifeBuoy size={helpIconSize} color={actionIcon} />
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
