import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import {
  ArrowLeft,
  Star,
  MessageCircle,
  CalendarDays,
  Heart,
  Share2,
  IndianRupee,
  BadgeCheck,
  ShieldCheck,
  Brain,
} from "lucide-react-native";
import { useThemeMode } from "@/theme/ThemeProvider";
import { palettes } from "@/theme/colors";
import { api } from "@/lib/api";
import { useCounsellor } from "@/hooks/useQueries";

const HERO_GREEN = "#2d5c3e";

function generateDates(n = 30): Date[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d;
  });
}

const ALL_SLOTS = [
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
  "19:00",
  "20:00",
  "21:00",
];
const DURATION_OPTIONS = [60, 120, 180] as const;

type SlotStatus = "available" | "booked" | "pending" | "unavailable" | "past";
type AvailabilitySlot = {
  startTime: string;
  startsAt: string;
  status: SlotStatus;
  isSelectable: boolean;
  label: string;
  statusLabel: string;
};

function fmt(t: string) {
  const h = parseInt(t);
  const h12 = h % 12 || 12;
  return `${h12}:00 ${h < 12 ? "AM" : "PM"}`;
}
function dateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function isPast(date: Date, t: string) {
  const [h] = t.split(":").map(Number);
  const s = new Date(date);
  s.setHours(h, 0, 0, 0);
  return s <= new Date();
}

function formatDuration(durationMinutes: number) {
  const hours = durationMinutes / 60;
  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
}

export default function CounsellorProfile({ navigation, route }: any) {
  const { counsellorId } = route.params || {};
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const isDark = scheme === "dark";
  const insets = useSafeAreaInsets();

  const [isFav, setIsFav] = useState(false);
  const [dateIdx, setDateIdx] = useState(0);
  const [selectedTime, setTime] = useState<string | null>(null);
  const [selectedDuration, setSelectedDuration] = useState(60);
  const [showAllSlots, setShowAll] = useState(false);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState(false);

  const dates = useMemo(() => generateDates(30), []);
  const selectedDate = dates[dateIdx];

  // React Query — cached for 5 min, shared with other screens that show this counsellor
  const {
    data: counsellor,
    isLoading: loading,
    isError,
  } = useCounsellor(counsellorId);

  useEffect(() => {
    if (!counsellor?.id) return;
    let cancelled = false;
    setSlotsLoading(true);
    setSlotsError(false);
    setTime(null);

    api
      .getCounsellorAvailability(
        counsellor.id,
        dateValue(selectedDate),
        dateValue(selectedDate),
        selectedDuration,
      )
      .then((response) => {
        if (cancelled) return;
        const nextSlots = response.success
          ? response.data?.availability?.[0]?.slots || []
          : [];
        setSlots(nextSlots);
        setSlotsError(!response.success);
      })
      .catch(() => {
        if (!cancelled) {
          setSlots([]);
          setSlotsError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [counsellor?.id, selectedDate, selectedDuration]);

  // Navigate back if the profile fails to load
  useEffect(() => {
    if (isError) {
      Alert.alert("Error", "Failed to load profile.");
      navigation.goBack();
    }
  }, [isError, navigation]);

  const handleBook = () => {
    if (!selectedTime) {
      Alert.alert("Select Time", "Please pick a time slot first.");
      return;
    }
    const selectedSlot = slots.find((slot) => slot.startTime === selectedTime);
    if (selectedSlot && !selectedSlot.isSelectable) {
      Alert.alert(
        "Slot unavailable",
        "This time slot was just booked by someone else. Please choose another available slot.",
      );
      return;
    }
    const at = selectedSlot?.startsAt
      ? new Date(selectedSlot.startsAt)
      : (() => {
          const [h] = selectedTime.split(":").map(Number);
          const fallback = new Date(selectedDate);
          fallback.setHours(h, 0, 0, 0);
          return fallback;
        })();
    navigation.navigate("BookingReview", {
      counsellorId: counsellor?.id,
      counsellorName: counsellor?.name,
      sessionType: "video",
      sessionDuration: selectedDuration,
      scheduledAt: at.toISOString(),
      hourlyRate: counsellor?.hourlyRate || 0,
      currency: counsellor?.currency || "INR",
    });
  };

  const handleMessage = () => {
    navigation.navigate("ChatThread", { counsellorId: counsellor?.id });
  };

  const fallbackSlots: AvailabilitySlot[] = ALL_SLOTS.map((time) => ({
    startTime: time,
    startsAt: "",
    status: isPast(selectedDate, time) ? "past" : "available",
    isSelectable: !isPast(selectedDate, time),
    label: fmt(time),
    statusLabel: isPast(selectedDate, time) ? "Past" : "Available",
  }));
  const slotSource =
    slots.length > 0 ? slots : slotsLoading || slotsError ? [] : fallbackSlots;
  const selectableSlots = slotSource.filter((slot) => slot.isSelectable);
  const visibleSlots = showAllSlots ? slotSource : slotSource.slice(0, 6);
  const hasMore = !showAllSlots && slotSource.length > 6;

  const hourlyRate = Number(counsellor?.hourlyRate || 0);
  const estimatedTotal = Math.round((hourlyRate * selectedDuration) / 60);
  const hourlyRateLabel = `₹${hourlyRate.toLocaleString("en-IN")}`;
  const totalPriceLabel = `₹${estimatedTotal.toLocaleString("en-IN")}`;

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? colors.bg : "#f5f7f5" }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ─────────────── HERO ─────────────── */}
        <View
          style={{
            backgroundColor: HERO_GREEN,
            paddingBottom: 18,
            paddingTop: insets.top,
          }}
        >
          {/* Decorative circles */}
          <View
            style={{
              position: "absolute",
              top: -20,
              right: -20,
              width: 120,
              height: 120,
              borderRadius: 60,
              backgroundColor: "rgba(255,255,255,0.04)",
            }}
          />
          <View
            style={{
              position: "absolute",
              top: 20,
              right: 20,
              width: 75,
              height: 75,
              borderRadius: 38,
              backgroundColor: "rgba(255,255,255,0.05)",
            }}
          />

          {/* Top bar */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 16,
              paddingTop: 8,
              paddingBottom: 12,
            }}
          >
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: "rgba(255,255,255,0.18)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ArrowLeft size={18} color="white" />
            </TouchableOpacity>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                onPress={() => setIsFav(!isFav)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: "rgba(255,255,255,0.18)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Heart
                  size={17}
                  color={isFav ? "#ef4444" : "white"}
                  fill={isFav ? "#ef4444" : "transparent"}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: "rgba(255,255,255,0.18)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Share2 size={17} color="white" />
              </TouchableOpacity>
            </View>
          </View>

          {loading ? (
            <View style={{ paddingVertical: 36, alignItems: "center" }}>
              <ActivityIndicator size="large" color="white" />
            </View>
          ) : counsellor ? (
            <View style={{ paddingHorizontal: 16 }}>
              {/* Avatar + info */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  marginBottom: 14,
                }}
              >
                <View style={{ position: "relative", marginRight: 14 }}>
                  {counsellor.profileImage ? (
                    <Image
                      source={{ uri: counsellor.profileImage }}
                      style={{
                        width: 76,
                        height: 76,
                        borderRadius: 38,
                        borderWidth: 2.5,
                        borderColor: "rgba(255,255,255,0.7)",
                      }}
                      contentFit="cover"
                    />
                  ) : (
                    <View
                      style={{
                        width: 76,
                        height: 76,
                        borderRadius: 38,
                        borderWidth: 2.5,
                        borderColor: "rgba(255,255,255,0.7)",
                        backgroundColor: "rgba(255,255,255,0.15)",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 26,
                          fontWeight: "800",
                          color: "white",
                        }}
                      >
                        {counsellor.name?.charAt(0)?.toUpperCase() || "C"}
                      </Text>
                    </View>
                  )}
                  {counsellor.isAvailable && (
                    <View
                      style={{
                        position: "absolute",
                        bottom: 3,
                        right: 3,
                        width: 15,
                        height: 15,
                        borderRadius: 8,
                        backgroundColor: "#22c55e",
                        borderWidth: 2.5,
                        borderColor: HERO_GREEN,
                      }}
                    />
                  )}
                </View>

                {/* Name / specialty / rating */}
                <View style={{ flex: 1, paddingTop: 2 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: 6,
                      marginBottom: 3,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 18,
                        fontWeight: "800",
                        color: "white",
                        letterSpacing: -0.2,
                      }}
                      numberOfLines={1}
                    >
                      {counsellor.name}
                    </Text>
                    {counsellor.isAvailable && (
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 4,
                          backgroundColor: "rgba(255,255,255,0.18)",
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderRadius: 20,
                        }}
                      >
                        <View
                          style={{
                            width: 5,
                            height: 5,
                            borderRadius: 3,
                            backgroundColor: "#4ade80",
                          }}
                        />
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: "700",
                            color: "white",
                          }}
                        >
                          Available
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text
                    style={{
                      fontSize: 13,
                      color: "rgba(255,255,255,0.80)",
                      marginBottom: 6,
                    }}
                    numberOfLines={1}
                  >
                    {counsellor.specialization || "Counsellor"}
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <Star size={13} color="#FFD700" fill="#FFD700" />
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "700",
                        color: "white",
                      }}
                    >
                      {counsellor.rating?.toFixed(1) ?? "0.0"}
                    </Text>
                    <Text
                      style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}
                    >
                      ({counsellor.reviewCount || 0} reviews)
                    </Text>
                  </View>
                </View>
              </View>

              {/* Stats bar */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: "rgba(0,0,0,0.20)",
                  borderRadius: 14,
                  paddingVertical: 10,
                  paddingHorizontal: 6,
                  marginBottom: 14,
                }}
              >
                {[
                  {
                    Icon: IndianRupee,
                    value: hourlyRateLabel,
                    label: "per hour",
                  },
                  {
                    Icon: CalendarDays,
                    value: (counsellor.totalSessions || 0).toLocaleString(
                      "en-IN",
                    ),
                    label: "completed",
                  },
                  {
                    Icon: BadgeCheck,
                    value: `${counsellor.experience || 0}+`,
                    label: "years exp",
                  },
                ].map((s, i) => (
                  <View key={i} style={{ flex: 1, alignItems: "center" }}>
                    {i > 0 && (
                      <View
                        style={{
                          position: "absolute",
                          left: 0,
                          top: 4,
                          bottom: 4,
                          width: 1,
                          backgroundColor: "rgba(255,255,255,0.2)",
                        }}
                      />
                    )}
                    <View
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 14,
                        backgroundColor: "rgba(255,255,255,0.12)",
                        alignItems: "center",
                        justifyContent: "center",
                        marginBottom: 4,
                      }}
                    >
                      <s.Icon size={13} color="rgba(255,255,255,0.85)" />
                    </View>
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "800",
                        color: "white",
                        marginBottom: 1,
                      }}
                    >
                      {s.value}
                    </Text>
                    <Text
                      style={{ fontSize: 10, color: "rgba(255,255,255,0.70)" }}
                    >
                      {s.label}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Action buttons */}
              <View style={{ flexDirection: "row", gap: 10 }}>
                <TouchableOpacity
                  onPress={handleMessage}
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    paddingVertical: 11,
                    borderRadius: 50,
                    borderWidth: 1.5,
                    borderColor: "rgba(255,255,255,0.6)",
                  }}
                >
                  <MessageCircle size={15} color="white" />
                  <Text
                    style={{ color: "white", fontSize: 14, fontWeight: "700" }}
                  >
                    Message
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleBook}
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    paddingVertical: 11,
                    borderRadius: 50,
                    backgroundColor: "white",
                  }}
                >
                  <CalendarDays size={15} color={HERO_GREEN} />
                  <Text
                    style={{
                      color: HERO_GREEN,
                      fontSize: 14,
                      fontWeight: "700",
                    }}
                  >
                    Book Session
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </View>

        {/* ─────────────── WHITE CONTENT ─────────────── */}
        <View style={{ backgroundColor: isDark ? colors.bg : "#ffffff" }}>
          {/* About */}
          <View
            style={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: 16 }}
          >
            <Text
              style={{
                fontSize: 16,
                fontWeight: "800",
                color: colors.text,
                marginBottom: 8,
              }}
            >
              About
            </Text>
            <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 20 }}>
              {counsellor?.bio || "No bio available."}
            </Text>
          </View>
          <View
            style={{
              height: 1,
              backgroundColor: isDark ? colors.border : "#f0f4f0",
              marginHorizontal: 16,
            }}
          />

          {/* Specializations */}
          {(counsellor?.specializations?.length ?? 0) > 0 && (
            <>
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingTop: 16,
                  paddingBottom: 16,
                }}
              >
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "800",
                    color: colors.text,
                    marginBottom: 10,
                  }}
                >
                  Specializations
                </Text>
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}
                >
                  {counsellor!.specializations.map((spec, i) => (
                    <View
                      key={i}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 5,
                        backgroundColor: colors.primary + "12",
                        paddingHorizontal: 11,
                        paddingVertical: 6,
                        borderRadius: 20,
                      }}
                    >
                      <Brain size={12} color={colors.primary} />
                      <Text
                        style={{
                          fontSize: 12,
                          color: colors.primary,
                          fontWeight: "600",
                        }}
                      >
                        {spec}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
              <View
                style={{
                  height: 1,
                  backgroundColor: isDark ? colors.border : "#f0f4f0",
                  marginHorizontal: 16,
                }}
              />
            </>
          )}

          {/* Duration and counselor-rate pricing */}
          <View
            style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16 }}
          >
            <Text
              style={{ fontSize: 16, fontWeight: "800", color: colors.text }}
            >
              Choose Duration
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: colors.muted,
                lineHeight: 18,
                marginTop: 3,
                marginBottom: 12,
              }}
            >
              Your total is the counsellor’s hourly rate multiplied by the time
              you choose.
            </Text>

            <View style={{ flexDirection: "row", gap: 8 }}>
              {DURATION_OPTIONS.map((duration) => {
                const selected = selectedDuration === duration;
                return (
                  <TouchableOpacity
                    key={duration}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${formatDuration(duration)} session`}
                    onPress={() => setSelectedDuration(duration)}
                    activeOpacity={0.82}
                    style={{
                      flex: 1,
                      minHeight: 48,
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 12,
                      borderWidth: 1.5,
                      borderColor: selected
                        ? colors.primary
                        : isDark
                          ? colors.border
                          : "#e2e8e2",
                      backgroundColor: selected
                        ? colors.primary
                        : isDark
                          ? colors.surface
                          : "#ffffff",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "800",
                        color: selected ? "white" : colors.text,
                      }}
                    >
                      {formatDuration(duration)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View
              style={{
                marginTop: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderRadius: 12,
                backgroundColor: isDark ? colors.surface : "#f3f8f4",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <View>
                <Text style={{ fontSize: 11, color: colors.muted }}>
                  Rate × duration
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    color: colors.text,
                    fontWeight: "700",
                    marginTop: 2,
                  }}
                >
                  {hourlyRateLabel}/hour × {formatDuration(selectedDuration)}
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 19,
                  color: colors.primary,
                  fontWeight: "900",
                }}
              >
                {totalPriceLabel}
              </Text>
            </View>
          </View>
          <View
            style={{
              height: 1,
              backgroundColor: isDark ? colors.border : "#f0f4f0",
              marginHorizontal: 16,
            }}
          />

          {/* Pick a Date & Time */}
          <View
            style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 20 }}
          >
            <Text
              style={{
                fontSize: 16,
                fontWeight: "800",
                color: colors.text,
                marginBottom: 12,
              }}
            >
              Pick a Date & Time
            </Text>

            {/* Date chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 6, paddingBottom: 2 }}
              style={{ marginBottom: 12 }}
            >
              {dates.slice(0, 7).map((date, i) => {
                const isSel = dateIdx === i;
                const isToday = i === 0;
                const day = date.toLocaleDateString("en-US", {
                  weekday: "short",
                });
                const num = date.getDate();
                const mon = date.toLocaleDateString("en-US", {
                  month: "short",
                });
                return (
                  <TouchableOpacity
                    key={i}
                    onPress={() => setDateIdx(i)}
                    style={{
                      alignItems: "center",
                      minWidth: 54,
                      backgroundColor: isSel
                        ? colors.primary
                        : isDark
                          ? colors.surface
                          : "#ffffff",
                      borderRadius: 12,
                      paddingVertical: 9,
                      paddingHorizontal: 8,
                      borderWidth: 1.5,
                      borderColor: isSel
                        ? colors.primary
                        : isDark
                          ? colors.border
                          : "#e2e8e2",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: "600",
                        color: isSel ? "rgba(255,255,255,0.85)" : colors.muted,
                        marginBottom: 3,
                      }}
                    >
                      {isToday ? "Today" : day}
                    </Text>
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: "800",
                        color: isSel ? "white" : colors.text,
                      }}
                    >
                      {num}
                    </Text>
                    <Text
                      style={{
                        fontSize: 10,
                        color: isSel ? "rgba(255,255,255,0.80)" : colors.muted,
                        marginTop: 2,
                      }}
                    >
                      {mon}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                style={{
                  width: 54,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: isDark ? colors.surface : "#ffffff",
                  borderRadius: 12,
                  borderWidth: 1.5,
                  borderColor: isDark ? colors.border : "#e2e8e2",
                }}
              >
                <CalendarDays size={16} color={colors.muted} />
              </TouchableOpacity>
            </ScrollView>

            {/* Time slots */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 7,
                flexWrap: "wrap",
              }}
            >
              {slotsLoading && (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    paddingVertical: 8,
                  }}
                >
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text
                    style={{
                      color: colors.muted,
                      fontSize: 12,
                      fontWeight: "600",
                    }}
                  >
                    Loading available slots...
                  </Text>
                </View>
              )}
              {!slotsLoading && slotsError && (
                <Text
                  style={{
                    color: colors.muted,
                    fontSize: 12,
                    fontWeight: "600",
                  }}
                >
                  Could not refresh availability. Please try again in a moment.
                </Text>
              )}
              {!slotsLoading && !slotsError && visibleSlots.length === 0 && (
                <Text
                  style={{
                    color: colors.muted,
                    fontSize: 12,
                    fontWeight: "600",
                  }}
                >
                  No slots are available for this day.
                </Text>
              )}
              {!slotsLoading &&
                !slotsError &&
                visibleSlots.map((slot) => {
                  const isSel = selectedTime === slot.startTime;
                  const disabled = !slot.isSelectable;
                  const statusColor =
                    slot.status === "booked"
                      ? "#EF4444"
                      : slot.status === "pending"
                        ? "#F59E0B"
                        : colors.muted;
                  return (
                    <TouchableOpacity
                      key={slot.startsAt || slot.startTime}
                      onPress={() => {
                        if (!disabled) setTime(slot.startTime);
                      }}
                      disabled={disabled}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 9,
                        borderRadius: 10,
                        backgroundColor: isSel
                          ? colors.primary
                          : isDark
                            ? colors.surface
                            : "#ffffff",
                        borderWidth: 1.5,
                        borderColor: isSel
                          ? colors.primary
                          : disabled
                            ? statusColor + "55"
                            : isDark
                              ? colors.border
                              : "#e2e8e2",
                        opacity: disabled ? 0.55 : 1,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: "700",
                          color: isSel
                            ? "white"
                            : disabled
                              ? statusColor
                              : colors.text,
                        }}
                      >
                        {slot.label || fmt(slot.startTime)}
                      </Text>
                      {slot.status !== "available" && (
                        <Text
                          style={{
                            marginTop: 2,
                            fontSize: 9,
                            fontWeight: "700",
                            color: isSel ? "white" : statusColor,
                          }}
                        >
                          {slot.statusLabel}
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              {!slotsLoading && !slotsError && hasMore && (
                <TouchableOpacity
                  onPress={() => setShowAll(true)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 9,
                    borderRadius: 10,
                    borderWidth: 1.5,
                    borderColor: isDark ? colors.border : "#e2e8e2",
                    backgroundColor: isDark ? colors.surface : "#ffffff",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 3,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "700",
                      color: colors.muted,
                    }}
                  >
                    More
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>›</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </ScrollView>

      {/* ─────────────── BOTTOM CTA ─────────────── */}
      {!loading && counsellor && (
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: isDark ? colors.bg : "#ffffff",
            paddingHorizontal: 16,
            paddingBottom: insets.bottom + 8,
            paddingTop: 12,
            borderTopWidth: 1,
            borderTopColor: isDark ? colors.border : "#f0f4f0",
          }}
        >
          <TouchableOpacity
            onPress={handleBook}
            disabled={
              !selectedTime ||
              slotsLoading ||
              slotsError ||
              selectableSlots.length === 0
            }
            activeOpacity={0.88}
            style={{
              backgroundColor:
                selectedTime && !slotsLoading && !slotsError
                  ? HERO_GREEN
                  : isDark
                    ? colors.surface
                    : "#e2e8e2",
              paddingVertical: 17,
              borderRadius: 50,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                color:
                  selectedTime && !slotsLoading && !slotsError
                    ? "white"
                    : colors.muted,
                fontSize: 16,
                fontWeight: "800",
                letterSpacing: 0.1,
              }}
            >
              {selectedTime
                ? `Book ${fmt(selectedTime)} · ${totalPriceLabel}`
                : "Select a Time Slot"}
            </Text>
          </TouchableOpacity>

          {/* Secure footer */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 5,
              marginTop: 10,
            }}
          >
            <ShieldCheck size={13} color={colors.muted} />
            <Text style={{ fontSize: 12, color: colors.muted }}>
              Secure booking. Cancel anytime.
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
