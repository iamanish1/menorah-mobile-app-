import { useEffect, useMemo, useState, type PropsWithChildren } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowRight, Search, X } from "lucide-react-native";
import Animated, {
  cancelAnimation,
  Easing,
  FadeInUp,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, {
  Defs,
  Ellipse,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import { useIOSTheme } from "@/components/ios/iosTheme";
import { useCounsellors, useSpecializations } from "@/hooks/useQueries";
import type { Counsellor } from "@/lib/api";

type MobileCounsellorDiscoveryProps = {
  onOpenDirectory: (search?: string) => void;
  onOpenCounsellor: (counsellorId: string) => void;
};

const DIRECTORY_WAVE_COLORS = [
  "#2F482E",
  "#46A067",
  "#89D297",
  "#64633F",
] as const;
const DIRECTORY_WAVE_LOCATIONS = [0, 0.34, 0.58, 1] as const;
const DIRECTORY_WAVE_FLOW_MS = 7200;
const DIRECTORY_WAVE_RIBBON_MS = 6400;
const DIRECTORY_WAVE_RINGS_MS = 8000;
const DIRECTORY_WAVE_RINGS = [28, 54, 80, 106, 132, 158, 184] as const;

export default function MobileCounsellorDiscovery({
  onOpenDirectory,
  onOpenCounsellor,
}: MobileCounsellorDiscoveryProps) {
  const iosTheme = useIOSTheme();
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [specialization, setSpecialization] = useState<string | undefined>();

  const {
    data: availableSpecializations = [],
    isLoading: areSpecializationsLoading,
    isError: didSpecializationsFail,
    refetch: refetchSpecializations,
  } = useSpecializations();

  const specializationFilters = useMemo(
    () => [
      { label: "All", value: undefined as string | undefined },
      ...Array.from(
        new Set(
          availableSpecializations
            .map((availableSpecialization) => availableSpecialization.trim())
            .filter(Boolean),
        ),
      )
        .sort((first, second) => first.localeCompare(second))
        .map((value) => ({ label: value, value })),
    ],
    [availableSpecializations],
  );

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const queryParams = useMemo(
    () => ({
      limit: 1,
      sortBy: "rating" as const,
      sortOrder: "desc" as const,
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      ...(specialization ? { specialization } : {}),
    }),
    [debouncedSearch, specialization],
  );

  const { data, isLoading, isFetching, isError, refetch } =
    useCounsellors(queryParams);
  const counsellor = data?.counsellors[0];
  const total = data?.pagination?.total ?? data?.counsellors.length ?? 0;
  const resultLabel = counsellor
    ? `Showing 1 of ${Math.max(total, 1)} counsellor${total === 1 ? "" : "s"}`
    : "No counsellors match these filters";

  const openDirectory = () => onOpenDirectory(searchInput.trim() || undefined);

  return (
    <View style={{ gap: iosTheme.spacing.lg }}>
      <View
        style={{
          minHeight: 76,
          justifyContent: "center",
          paddingHorizontal: iosTheme.spacing.xl,
          paddingVertical: iosTheme.spacing.md,
          borderRadius: iosTheme.radius.xl,
          borderCurve: "continuous",
          borderWidth: 1,
          borderColor: iosTheme.colors.border,
          backgroundColor: iosTheme.colors.surfaceAlt,
        }}
      >
        <Text
          accessibilityRole="header"
          style={{
            color: iosTheme.colors.text,
            fontSize: 25,
            lineHeight: 31,
            fontWeight: "900",
            letterSpacing: -0.4,
          }}
        >
          Find your counsellor
        </Text>
      </View>

      <View
        style={{
          minHeight: 52,
          flexDirection: "row",
          alignItems: "center",
          gap: iosTheme.spacing.sm,
          paddingLeft: iosTheme.spacing.lg,
          paddingRight: searchInput ? iosTheme.spacing.xs : iosTheme.spacing.lg,
          borderRadius: iosTheme.radius.pill,
          borderWidth: 1,
          borderColor: iosTheme.colors.border,
          backgroundColor: iosTheme.colors.surface,
          boxShadow: `0 8px 24px ${iosTheme.colors.shadow}12`,
        }}
      >
        <Search size={19} color={iosTheme.colors.textMuted} strokeWidth={2.2} />
        <TextInput
          value={searchInput}
          onChangeText={setSearchInput}
          onSubmitEditing={() => setDebouncedSearch(searchInput.trim())}
          accessibilityLabel="Search counsellors"
          placeholder="Search name or specialization"
          placeholderTextColor={iosTheme.colors.textMuted}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          style={{
            flex: 1,
            minHeight: 50,
            color: iosTheme.colors.text,
            fontSize: 15,
            paddingVertical: 0,
          }}
        />
        {searchInput ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear counsellor search"
            hitSlop={4}
            onPress={() => {
              setSearchInput("");
              setDebouncedSearch("");
            }}
            style={({ pressed }) => ({
              width: 48,
              height: 48,
              borderRadius: 24,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.58 : 1,
            })}
          >
            <X size={19} color={iosTheme.colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        horizontal
        bounces={false}
        accessibilityLabel="Counsellor specialization filters"
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          gap: iosTheme.spacing.sm,
          paddingRight: iosTheme.spacing.xl,
        }}
      >
        {specializationFilters.map((filter) => {
          const selected = specialization === filter.value;

          return (
            <Pressable
              key={filter.label}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setSpecialization(filter.value)}
              style={({ pressed }) => ({
                minHeight: 46,
                justifyContent: "center",
                paddingHorizontal: iosTheme.spacing.lg,
                borderRadius: iosTheme.radius.pill,
                borderWidth: 1,
                borderColor: selected
                  ? iosTheme.colors.primary
                  : iosTheme.colors.border,
                backgroundColor: selected
                  ? iosTheme.colors.primary
                  : iosTheme.colors.surface,
                opacity: pressed ? 0.72 : 1,
              })}
            >
              <Text
                style={{
                  color: selected
                    ? iosTheme.colors.onPrimary
                    : iosTheme.colors.text,
                  fontSize: 14,
                  fontWeight: "800",
                }}
              >
                {filter.label}
              </Text>
            </Pressable>
          );
        })}
        {areSpecializationsLoading ? (
          <View
            accessibilityLabel="Loading counsellor specializations"
            style={{
              minWidth: 48,
              minHeight: 46,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ActivityIndicator size="small" color={iosTheme.colors.primary} />
          </View>
        ) : didSpecializationsFail ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => refetchSpecializations()}
            style={({ pressed }) => ({
              minHeight: 46,
              justifyContent: "center",
              paddingHorizontal: iosTheme.spacing.lg,
              borderRadius: iosTheme.radius.pill,
              borderWidth: 1,
              borderColor: iosTheme.colors.border,
              backgroundColor: iosTheme.colors.surface,
              opacity: pressed ? 0.72 : 1,
            })}
          >
            <Text
              style={{
                color: iosTheme.colors.primary,
                fontSize: 14,
                fontWeight: "800",
              }}
            >
              Retry specializations
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <View
        style={{
          minHeight: 24,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: iosTheme.spacing.sm,
        }}
      >
        <Text
          accessibilityLiveRegion="polite"
          style={{
            flex: 1,
            color: iosTheme.colors.textSecondary,
            fontSize: 13,
            lineHeight: 18,
            fontWeight: "700",
            fontVariant: ["tabular-nums"],
          }}
        >
          {isLoading ? "Finding counsellors…" : resultLabel}
        </Text>
        {isFetching && !isLoading ? (
          <ActivityIndicator size="small" color={iosTheme.colors.primary} />
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={openDirectory}
          style={({ pressed }) => ({
            minHeight: 44,
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            paddingHorizontal: iosTheme.spacing.sm,
            opacity: pressed ? 0.58 : 1,
          })}
        >
          <Text
            style={{
              color: iosTheme.colors.primary,
              fontSize: 14,
              fontWeight: "900",
            }}
          >
            View all
          </Text>
          <ArrowRight size={16} color={iosTheme.colors.primary} />
        </Pressable>
      </View>

      {isLoading && !counsellor ? (
        <LoadingCard />
      ) : isError ? (
        <MessageCard
          title="Counsellors could not load"
          body="Check your connection and try again."
          actionLabel="Try again"
          onAction={() => refetch()}
        />
      ) : counsellor ? (
        <CounsellorPreviewCard
          counsellor={counsellor}
          onOpen={() => onOpenCounsellor(counsellor.id)}
        />
      ) : (
        <MessageCard
          title="No counsellors found"
          body="Try another search or choose a different speciality."
        />
      )}
    </View>
  );
}

function LoadingCard() {
  const iosTheme = useIOSTheme();

  return (
    <View
      accessibilityLabel="Loading counsellors"
      style={{
        minHeight: 260,
        alignItems: "center",
        justifyContent: "center",
        gap: iosTheme.spacing.md,
        borderRadius: iosTheme.radius.xl,
        borderCurve: "continuous",
        borderWidth: 1,
        borderColor: iosTheme.colors.border,
        backgroundColor: iosTheme.colors.surface,
      }}
    >
      <ActivityIndicator size="large" color={iosTheme.colors.primary} />
      <Text style={iosTheme.typography.body}>Loading counsellors…</Text>
    </View>
  );
}

function MessageCard({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const iosTheme = useIOSTheme();

  return (
    <View
      style={{
        padding: iosTheme.spacing.xl,
        alignItems: "center",
        gap: iosTheme.spacing.md,
        borderRadius: iosTheme.radius.xl,
        borderCurve: "continuous",
        borderWidth: 1,
        borderColor: iosTheme.colors.border,
        backgroundColor: iosTheme.colors.surface,
      }}
    >
      <Search size={28} color={iosTheme.colors.textMuted} />
      <Text style={iosTheme.typography.cardTitle}>{title}</Text>
      <Text style={[iosTheme.typography.body, { textAlign: "center" }]}>
        {body}
      </Text>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={({ pressed }) => ({
            minHeight: 48,
            justifyContent: "center",
            paddingHorizontal: iosTheme.spacing.xl,
            borderRadius: iosTheme.radius.pill,
            backgroundColor: iosTheme.colors.primary,
            opacity: pressed ? 0.72 : 1,
          })}
        >
          <Text
            style={{
              color: iosTheme.colors.onPrimary,
              fontSize: 14,
              fontWeight: "900",
            }}
          >
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function CounsellorPreviewCard({
  counsellor,
  onOpen,
}: {
  counsellor: Counsellor;
  onOpen: () => void;
}) {
  const iosTheme = useIOSTheme();
  const reduceMotion = useReducedMotion();
  const pressProgress = useSharedValue(0);

  const pressStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pressProgress.value, [0, 1], [1, 0.94]),
    transform: [
      { scale: interpolate(pressProgress.value, [0, 1], [1, 0.985]) },
    ],
  }));

  const setPressed = (pressed: boolean) => {
    if (reduceMotion) {
      pressProgress.value = pressed ? 1 : 0;
      return;
    }
    pressProgress.value = withTiming(pressed ? 1 : 0, {
      duration: pressed ? 110 : 180,
      easing: Easing.out(Easing.cubic),
    });
  };

  return (
    <Animated.View
      entering={
        reduceMotion
          ? undefined
          : FadeInUp.duration(420).easing(Easing.out(Easing.cubic))
      }
      style={[
        {
          overflow: "hidden",
          borderRadius: iosTheme.radius.xl,
          borderCurve: "continuous",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.22)",
          backgroundColor: "#2F482E",
          boxShadow: `0 14px 30px ${iosTheme.colors.shadow}20`,
        },
        pressStyle,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${counsellor.name} counsellor profile`}
        accessibilityHint="View counsellor details and book a session"
        onPress={onOpen}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        android_ripple={{
          color: "rgba(255,255,255,0.12)",
          foreground: true,
        }}
      >
        <DirectoryWaveHeader
          reduceMotion={reduceMotion}
          style={{
            minHeight: 136,
          }}
        >
          <LinearGradient
            pointerEvents="none"
            colors={[
              "rgba(23,49,30,0.52)",
              "rgba(23,49,30,0.18)",
              "rgba(23,49,30,0.04)",
            ]}
            locations={[0, 0.58, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={{ position: "absolute", inset: 0, zIndex: 1 }}
          />

          <View
            style={{
              zIndex: 2,
              minHeight: 101,
              justifyContent: "center",
              alignItems: "flex-start",
              gap: 4,
              paddingLeft: iosTheme.spacing.lg,
              paddingRight: 108,
              paddingTop: 10,
              paddingBottom: 8,
            }}
          >
            <Text
              numberOfLines={2}
              style={{
                color: iosTheme.colors.onPrimary,
                fontSize: 22,
                lineHeight: 26,
                fontWeight: "900",
                letterSpacing: -0.45,
              }}
            >
              {counsellor.name}
            </Text>
            <Text
              numberOfLines={1}
              style={{
                color: iosTheme.colors.onPrimary,
                fontSize: 13,
                lineHeight: 18,
                fontWeight: "700",
                opacity: 0.86,
              }}
            >
              {counsellor.specialization || "Mental wellness"}
            </Text>
          </View>

          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              zIndex: 2,
              right: 14,
              top: 11,
              width: 80,
              height: 80,
              borderRadius: 40,
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              borderWidth: 2.5,
              borderColor: "rgba(255,255,255,0.96)",
              backgroundColor: iosTheme.colors.surfaceElevated,
              boxShadow: "0 6px 16px rgba(14,34,21,0.28)",
            }}
          >
            {counsellor.profileImage ? (
              <Image
                source={{ uri: counsellor.profileImage }}
                accessibilityLabel={`${counsellor.name} profile photo`}
                style={{ width: "100%", height: "100%" }}
                contentFit="cover"
              />
            ) : (
              <Text
                style={{
                  color: iosTheme.colors.primary,
                  fontSize: 31,
                  fontWeight: "900",
                }}
              >
                {getInitial(counsellor.name)}
              </Text>
            )}
          </View>

          <View
            pointerEvents="none"
            style={{
              zIndex: 2,
              minHeight: 35,
              width: "100%",
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: iosTheme.spacing.lg,
              borderTopWidth: 1,
              borderTopColor: "rgba(255,255,255,0.16)",
              backgroundColor: "rgba(20,47,28,0.22)",
            }}
          >
            <Text
              style={{
                color: "#FFFFFF",
                fontSize: 14,
                lineHeight: 20,
                fontWeight: "900",
                letterSpacing: 0.15,
                textAlign: "center",
              }}
            >
              Book now
            </Text>
          </View>
        </DirectoryWaveHeader>
      </Pressable>
    </Animated.View>
  );
}

function DirectoryWaveHeader({
  children,
  reduceMotion,
  style,
}: PropsWithChildren<{
  reduceMotion: boolean;
  style: Record<string, unknown>;
}>) {
  const flow = useSharedValue(0);
  const ribbon = useSharedValue(0);
  const rings = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(flow);
    cancelAnimation(ribbon);
    cancelAnimation(rings);

    if (reduceMotion) {
      flow.value = 0.5;
      ribbon.value = 0.5;
      rings.value = 0.5;
      return;
    }

    flow.value = withRepeat(
      withTiming(1, {
        duration: DIRECTORY_WAVE_FLOW_MS,
        easing: Easing.inOut(Easing.quad),
      }),
      -1,
      true,
    );
    ribbon.value = withRepeat(
      withTiming(1, {
        duration: DIRECTORY_WAVE_RIBBON_MS,
        easing: Easing.inOut(Easing.quad),
      }),
      -1,
      false,
    );
    rings.value = withRepeat(
      withTiming(1, {
        duration: DIRECTORY_WAVE_RINGS_MS,
        easing: Easing.inOut(Easing.quad),
      }),
      -1,
      true,
    );

    return () => {
      cancelAnimation(flow);
      cancelAnimation(ribbon);
      cancelAnimation(rings);
    };
  }, [flow, reduceMotion, ribbon, rings]);

  const flowStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(flow.value, [0, 1], [-34, 34]) },
      { translateY: interpolate(flow.value, [0, 1], [-6, 8]) },
      { scale: interpolate(flow.value, [0, 1], [1, 1.08]) },
    ],
  }));

  const ribbonStyle = useAnimatedStyle(() => ({
    opacity: interpolate(ribbon.value, [0, 0.5, 1], [0.28, 0.72, 0.38]),
    transform: [
      {
        translateX: interpolate(ribbon.value, [0, 0.5, 1], [-58, 14, 58]),
      },
      {
        translateY: interpolate(ribbon.value, [0, 0.5, 1], [12, -4, 4]),
      },
      {
        rotateZ: `${interpolate(ribbon.value, [0, 0.5, 1], [-8, -4, -10])}deg`,
      },
      {
        scaleX: interpolate(ribbon.value, [0, 0.5, 1], [0.92, 1.08, 0.98]),
      },
    ],
  }));

  const ringsStyle = useAnimatedStyle(() => ({
    opacity: interpolate(rings.value, [0, 1], [0.28, 0.56]),
    transform: [
      { translateX: interpolate(rings.value, [0, 1], [-12, 12]) },
      { translateY: interpolate(rings.value, [0, 1], [0, -4]) },
      { rotateZ: "8deg" },
      { scale: interpolate(rings.value, [0, 1], [1.08, 1.18]) },
    ],
  }));

  return (
    <View style={[{ position: "relative", overflow: "hidden" }, style]}>
      <LinearGradient
        colors={DIRECTORY_WAVE_COLORS}
        locations={DIRECTORY_WAVE_LOCATIONS}
        start={{ x: 0, y: 0.35 }}
        end={{ x: 1, y: 0.65 }}
        style={{
          position: "absolute",
          inset: 0,
        }}
      />

      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            left: "-30%",
            top: "-42%",
            width: "160%",
            height: "190%",
          },
          flowStyle,
        ]}
      >
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id="directoryMintGlow" cx="18%" cy="12%" r="42%">
              <Stop offset="0%" stopColor="#B2F0C5" stopOpacity={0.9} />
              <Stop offset="45%" stopColor="#B2F0C5" stopOpacity={0.62} />
              <Stop offset="100%" stopColor="#B2F0C5" stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="directoryOliveGlow" cx="88%" cy="20%" r="40%">
              <Stop offset="0%" stopColor="#97955E" stopOpacity={0.82} />
              <Stop offset="42%" stopColor="#97955E" stopOpacity={0.56} />
              <Stop offset="100%" stopColor="#97955E" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#directoryMintGlow)" />
          <Rect width="100%" height="100%" fill="url(#directoryOliveGlow)" />
        </Svg>
      </Animated.View>

      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            left: "-35%",
            top: 6,
            width: "170%",
            height: 112,
          },
          ribbonStyle,
        ]}
      >
        <LinearGradient
          colors={[
            "rgba(156,232,187,0)",
            "rgba(156,232,187,0.58)",
            "rgba(72,124,70,0.32)",
            "rgba(156,232,187,0)",
          ]}
          locations={[0, 0.24, 0.52, 0.78]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ flex: 1, borderRadius: 56 }}
        />
      </Animated.View>

      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            inset: -24,
          },
          ringsStyle,
        ]}
      >
        <Svg width="100%" height="100%" viewBox="0 0 420 180">
          {DIRECTORY_WAVE_RINGS.map((radius) => (
            <Ellipse
              key={radius}
              cx={264}
              cy={88}
              rx={radius}
              ry={radius * 0.42}
              fill="none"
              stroke="#D3F8E2"
              strokeOpacity={0.32}
              strokeWidth={2}
            />
          ))}
        </Svg>
      </Animated.View>

      {children}
    </View>
  );
}

function getInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "M";
}
