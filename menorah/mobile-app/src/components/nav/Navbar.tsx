'use client';
import { View, Pressable, Text, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Bell, LifeBuoy, Moon, Sun } from "lucide-react-native";
import { useThemeMode } from "@/theme/ThemeProvider";
import { palettes } from "@/theme/colors";
import { useAuth } from "@/state/useAuth";

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
  const { user } = useAuth();
  const isCompact = width < 390;

  const actionBg = scheme === 'dark' ? 'rgba(246,242,232,0.08)' : 'rgba(0,0,0,0.06)';
  const actionBorder = scheme === 'dark' ? 'rgba(255,255,255,0.08)' : colors.border;
  const actionIcon = scheme === 'dark' ? colors.text : '#1a2e22';
  const iconSize = isCompact ? 17 : 18;

  const ActionButton = ({
    icon,
    label,
    onPress,
    badge,
  }: {
    icon: React.ReactNode;
    label: string;
    onPress?: () => void;
    badge?: boolean;
  }) => (
    <Pressable
      onPress={onPress}
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: isCompact ? 46 : 52,
      }}
    >
      <View
        style={{
          backgroundColor: actionBg,
          borderWidth: 1,
          borderColor: actionBorder,
          borderRadius: 14,
          width: isCompact ? 38 : 42,
          height: isCompact ? 38 : 42,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
        {badge && (
          <View
            style={{
              position: 'absolute',
              top: 7,
              right: 7,
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: '#22c55e',
              borderWidth: 1.5,
              borderColor: colors.sand,
            }}
          />
        )}
      </View>
      <Text
        style={{
          color: colors.muted,
          fontSize: isCompact ? 10 : 11,
          fontWeight: '500',
          marginTop: 4,
          letterSpacing: 0.1,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );

  return (
    <View
      style={{
        paddingTop: Math.max(insets.top, 14),
        paddingHorizontal: 16,
        paddingBottom: 12,
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
      }}
    >
      {/* Left: avatar + greeting */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, paddingRight: 8 }}>
        {user?.profileImage ? (
          <Image
            source={{ uri: user.profileImage }}
            style={{ width: isCompact ? 44 : 48, height: isCompact ? 44 : 48, borderRadius: isCompact ? 22 : 24 }}
            contentFit="cover"
          />
        ) : (
          <View
            style={{
              width: isCompact ? 44 : 48,
              height: isCompact ? 44 : 48,
              borderRadius: isCompact ? 22 : 24,
              backgroundColor: colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: 'white', fontSize: isCompact ? 16 : 18, fontWeight: '700' }}>
              {user?.firstName?.[0]?.toUpperCase() ?? 'M'}
            </Text>
          </View>
        )}
        <View style={{ flexShrink: 1 }}>
          <Text style={{ color: colors.muted, fontSize: isCompact ? 11 : 12, fontWeight: '400' }}>
            Welcome back,
          </Text>
          <Text
            numberOfLines={1}
            style={{
              color: colors.text,
              fontSize: isCompact ? 17 : 19,
              fontWeight: '800',
              letterSpacing: -0.3,
              lineHeight: isCompact ? 22 : 24,
            }}
          >
            {user?.firstName ?? 'Menorah'}
          </Text>
          <Text style={{ color: colors.muted, fontSize: isCompact ? 10 : 11, fontWeight: '500' }}>
            Mind Over Matter
          </Text>
        </View>
      </View>

      {/* Right: action buttons */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: isCompact ? 2 : 4, flexShrink: 0 }}>
        <ActionButton
          icon={scheme === 'dark' ? <Sun size={iconSize} color={actionIcon} /> : <Moon size={iconSize} color={actionIcon} />}
          label={scheme === 'dark' ? 'Day' : 'Night'}
          onPress={toggle}
        />
        <ActionButton
          icon={<Bell size={iconSize} color={actionIcon} />}
          label="Alerts"
          onPress={onBell}
          badge={unreadCount > 0}
        />
        <ActionButton
          icon={<LifeBuoy size={iconSize} color={actionIcon} />}
          label="Help"
          onPress={onHelp}
        />
      </View>
    </View>
  );
}
