import { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Calendar,
  Clock,
  User,
  CheckCircle,
  Video,
  MessageCircle,
  ArrowLeft,
  ShieldCheck,
  CalendarCheck,
  ChevronRight,
  Wallet,
} from "lucide-react-native";
import { useThemeMode } from "@/theme/ThemeProvider";
import { palettes } from "@/theme/colors";
import { api } from "@/lib/api";
import { socketService, SessionStartedData } from "@/lib/socket";
import { reportError } from "@/lib/safeDiagnostics";
import { resolveBookingChatRoomId } from "@/lib/bookingChat";

const isSubscriptionAuthorizedBooking = (booking: any) =>
  Boolean(
    booking?.isSubscriptionBooking === true &&
      booking?.paymentMethod === "subscription" &&
      booking?.paymentStatus === "paid",
  );

export default function BookingReview({ navigation, route }: any) {
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const isDarkRoot = scheme === "dark";
  const primaryActionText = isDarkRoot ? colors.primaryDark : "white";
  const [isCreatingBooking, setIsCreatingBooking] = useState(false);
  const [loadingBooking, setLoadingBooking] = useState(false);
  const [existingBooking, setExistingBooking] = useState<any>(null);
  const [sessionReady, setSessionReady] = useState(false);

  const {
    bookingId,
    counsellorId,
    counsellorName,
    sessionType: directSessionType,
    sessionDuration: directDuration,
    scheduledAt: directScheduledAt,
    hourlyRate,
  } = route.params || {};

  // If bookingId is provided, fetch existing booking details
  useEffect(() => {
    if (bookingId) {
      fetchBookingDetails();
    }
  }, [bookingId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Real-time updates: refresh when counsellor assigns, reschedules, or starts session
  useEffect(() => {
    if (!bookingId) return;
    const refresh = () => fetchBookingDetails();
    const unsub1 = socketService.onBookingConfirmed((data) => {
      if (data.bookingId === bookingId) refresh();
    });
    const unsub2 = socketService.onBookingRescheduled((data) => {
      if (data.bookingId === bookingId) refresh();
    });
    const unsub3 = socketService.onBookingStatusChanged((data) => {
      if (data.bookingId === bookingId) refresh();
    });
    const unsub4 = socketService.onSessionStarted(
      (data: SessionStartedData) => {
        if (data.bookingId === bookingId) {
          setSessionReady(true);
          refresh();
        }
      },
    );
    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
    };
  }, [bookingId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchBookingDetails = async () => {
    if (!bookingId) return;

    setLoadingBooking(true);
    try {
      const response = await api.getBooking(bookingId);
      if (response.success && response.data?.booking) {
        setExistingBooking(response.data.booking);
      } else {
        Alert.alert(
          "Error",
          "Failed to load booking details. Please try again.",
        );
        navigation.goBack();
      }
    } catch (error: any) {
      reportError("booking.review_fetch_failed", error);
      Alert.alert("Error", "Failed to load booking details. Please try again.");
      navigation.goBack();
    } finally {
      setLoadingBooking(false);
    }
  };

  // If viewing existing booking, show different UI
  if (bookingId) {
    if (loadingBooking) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
          <View
            style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
          >
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ color: colors.text, fontSize: 16, marginTop: 16 }}>
              Loading booking details...
            </Text>
          </View>
        </SafeAreaView>
      );
    }

    if (!existingBooking) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              alignItems: "center",
              padding: 24,
            }}
          >
            <Text
              style={{ color: colors.text, fontSize: 16, textAlign: "center" }}
            >
              Booking not found. Please try again.
            </Text>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={{
                backgroundColor: colors.primary,
                paddingHorizontal: 24,
                paddingVertical: 12,
                borderRadius: 8,
                marginTop: 16,
              }}
            >
              <Text
                style={{
                  color: primaryActionText,
                  fontSize: 14,
                  fontWeight: "600",
                }}
              >
                Go Back
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }

    const isAssigned =
      existingBooking.counsellorName &&
      existingBooking.counsellorName !== "To be assigned";
    const isPaymentReviewRequired =
      existingBooking.paymentReviewRequired === true;
    const canJoin =
      !isPaymentReviewRequired &&
      (existingBooking.status === "in-progress" || sessionReady);
    const isConfirmedWithCounsellor =
      !isPaymentReviewRequired &&
      existingBooking.status === "confirmed" &&
      isAssigned;
    const isPending =
      !isPaymentReviewRequired &&
      (existingBooking.status === "pending" || !isAssigned);

    const statusColors: Record<string, string> = {
      pending: "#F59E0B",
      confirmed: colors.primary,
      "in-progress": "#10B981",
      completed: "#6B7280",
      cancelled: "#EF4444",
    };
    const statusColor = isPaymentReviewRequired
      ? "#F59E0B"
      : statusColors[existingBooking.status] || colors.muted;

    const openChat = async () => {
      try {
        const roomId =
          existingBooking.chat?.roomId ||
          (await resolveBookingChatRoomId(bookingId));
        navigation.navigate("ChatThread", { roomId });
      } catch (error: any) {
        reportError("booking.chat_resolution_failed", error);
        Alert.alert(
          "Chat Unavailable",
          error?.message || "Unable to open this conversation right now.",
        );
      }
    };

    const handleJoinSession = () => {
      if (existingBooking.sessionType === "video") {
        navigation.navigate("PreCallCheck", { bookingId });
      } else if (existingBooking.sessionType === "chat") {
        openChat();
      } else {
        navigation.navigate("PreCallCheck", { bookingId });
      }
    };

    const isDark = scheme === "dark";
    const cardBg = isDark ? colors.card : "white";
    const pageBg = isDark ? colors.bg : "#f5f7f5";
    const warningBg = isDark ? colors.accentLight : "#fff7ed";
    const warningBorder = isDark ? "#5A3E12" : "#fde68a";
    const warningText = isDark ? colors.accent : "#92400E";
    const warningIconBg = isDark ? "#35260D" : "#FEF3C7";

    const statusLabel = isPaymentReviewRequired
      ? "Payment Review"
      : existingBooking.status === "in-progress"
        ? "In Progress"
        : existingBooking.status.charAt(0).toUpperCase() +
          existingBooking.status.slice(1);

    const statusDescriptions: Record<string, string> = {
      confirmed:
        "Your session is all set. We're looking forward to your session.",
      pending: "Your booking is pending. A counsellor will be assigned soon.",
      "in-progress": "Your session is currently in progress. You can join now.",
      completed: "Your session has been completed. Thank you for choosing us!",
      cancelled: "Your session has been cancelled.",
    };
    const statusDescription = isPaymentReviewRequired
      ? "Payment status is being reconciled. Contact support if it does not update."
      : statusDescriptions[existingBooking.status] || "";

    const sessionTypeLabel =
      existingBooking.sessionType === "video"
        ? "Video Session"
        : existingBooking.sessionType === "audio"
          ? "Audio Session"
          : "Chat Session";

    let scheduledDateStr = "";
    let scheduledTimeStr = "";
    if (existingBooking.scheduledAt) {
      const d = new Date(existingBooking.scheduledAt);
      scheduledDateStr = d.toLocaleDateString("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      scheduledTimeStr = d.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    const paymentStatusColorMap: Record<string, string> = {
      paid: "#10B981",
      pending: "#F59E0B",
      failed: "#EF4444",
      refunded: "#6B7280",
    };
    const paymentColor =
      paymentStatusColorMap[existingBooking.paymentStatus] || colors.muted;
    const paymentLabel = existingBooking.paymentStatus
      ? existingBooking.paymentStatus.charAt(0).toUpperCase() +
        existingBooking.paymentStatus.slice(1)
      : "Pending";

    const showJoinButton = canJoin || isConfirmedWithCounsellor;

    return (
      <View style={{ flex: 1, backgroundColor: pageBg }}>
        {/* Header */}
        <SafeAreaView style={{ backgroundColor: cardBg }} edges={["top"]}>
          <View
            style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 14 }}
          >
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <ArrowLeft
                size={17}
                color={colors.primary}
                style={{ marginRight: 5 }}
              />
              <Text
                style={{
                  color: colors.primary,
                  fontSize: 14,
                  fontWeight: "600",
                }}
              >
                Back
              </Text>
            </TouchableOpacity>
            <Text
              style={{
                fontSize: 24,
                fontWeight: "800",
                color: colors.text,
                letterSpacing: -0.3,
              }}
            >
              Booking Details
            </Text>
            <Text style={{ fontSize: 13, color: colors.muted, marginTop: 3 }}>
              Here is everything about your session
            </Text>
          </View>
        </SafeAreaView>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            padding: 16,
            paddingBottom: showJoinButton ? 96 : 32,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* Status Card */}
          <View
            style={{
              backgroundColor: isDark ? colors.surfaceAlt : "#f0faf4",
              borderRadius: 20,
              padding: 18,
              marginBottom: 14,
              borderWidth: 1,
              borderColor: isDark ? colors.border : "#d1eedd",
              overflow: "hidden",
            }}
          >
            <Text
              style={{
                position: "absolute",
                top: 14,
                right: 46,
                color: colors.primary + "55",
                fontSize: 22,
                fontWeight: "300",
              }}
            >
              +
            </Text>
            <Text
              style={{
                position: "absolute",
                top: 30,
                right: 22,
                color: colors.primary + "55",
                fontSize: 16,
                fontWeight: "300",
              }}
            >
              +
            </Text>
            <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
              <View style={{ flex: 1 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 10,
                  }}
                >
                  <View
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 23,
                      backgroundColor: statusColor + "20",
                      alignItems: "center",
                      justifyContent: "center",
                      marginRight: 12,
                    }}
                  >
                    <ShieldCheck size={22} color={statusColor} />
                  </View>
                  <View>
                    <Text style={{ fontSize: 12, color: colors.muted }}>
                      Status
                    </Text>
                    <Text
                      style={{
                        fontSize: 22,
                        fontWeight: "800",
                        color: statusColor,
                        letterSpacing: -0.3,
                      }}
                    >
                      {statusLabel}
                    </Text>
                  </View>
                </View>
                <Text
                  style={{ fontSize: 13, color: colors.muted, lineHeight: 19 }}
                >
                  {statusDescription}
                </Text>
              </View>
              <View
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: 16,
                  marginLeft: 12,
                  backgroundColor: statusColor + "18",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <CalendarCheck size={28} color={statusColor} />
              </View>
            </View>
          </View>

          {/* Counsellor Card */}
          <View
            style={{
              backgroundColor: cardBg,
              borderRadius: 20,
              padding: 16,
              marginBottom: 14,
              borderWidth: 1,
              borderColor: isDark ? colors.border : "#e8ede8",
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: colors.primary + "18",
                alignItems: "center",
                justifyContent: "center",
                marginRight: 12,
              }}
            >
              <User size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{ fontSize: 12, color: colors.muted, marginBottom: 2 }}
              >
                Counsellor
              </Text>
              <Text
                style={{ fontSize: 16, fontWeight: "700", color: colors.text }}
              >
                {isAssigned
                  ? existingBooking.counsellorName
                  : "Awaiting Assignment"}
              </Text>
              {existingBooking.specialization ? (
                <Text
                  style={{ fontSize: 13, color: colors.muted, marginTop: 1 }}
                >
                  {existingBooking.specialization}
                </Text>
              ) : !isAssigned ? (
                <Text style={{ fontSize: 12, color: "#F59E0B", marginTop: 2 }}>
                  Will be assigned soon
                </Text>
              ) : null}
            </View>
            {isAssigned && (
              <TouchableOpacity
                onPress={openChat}
                style={{ alignItems: "center" }}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    backgroundColor: colors.primary + "14",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 3,
                  }}
                >
                  <MessageCircle size={20} color={colors.primary} />
                </View>
                <Text
                  style={{
                    fontSize: 11,
                    color: colors.primary,
                    fontWeight: "600",
                  }}
                >
                  Message
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Session Details Card */}
          <View
            style={{
              backgroundColor: cardBg,
              borderRadius: 20,
              padding: 16,
              marginBottom: 14,
              borderWidth: 1,
              borderColor: isDark ? colors.border : "#e8ede8",
            }}
          >
            <Text
              style={{
                fontSize: 16,
                fontWeight: "800",
                color: colors.text,
                marginBottom: 14,
                letterSpacing: -0.2,
              }}
            >
              Session Details
            </Text>

            {/* Type + Duration */}
            <View style={{ flexDirection: "row", marginBottom: 14 }}>
              <View
                style={{ flex: 1, flexDirection: "row", alignItems: "center" }}
              >
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 12,
                    backgroundColor: colors.primary + "14",
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 10,
                  }}
                >
                  <Video size={18} color={colors.primary} />
                </View>
                <View>
                  <Text style={{ fontSize: 12, color: colors.muted }}>
                    Type
                  </Text>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "700",
                      color: colors.text,
                    }}
                  >
                    {sessionTypeLabel}
                  </Text>
                </View>
              </View>
              <View
                style={{ flex: 1, flexDirection: "row", alignItems: "center" }}
              >
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 12,
                    backgroundColor: colors.primary + "14",
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 10,
                  }}
                >
                  <Clock size={18} color={colors.primary} />
                </View>
                <View>
                  <Text style={{ fontSize: 12, color: colors.muted }}>
                    Duration
                  </Text>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "700",
                      color: colors.text,
                    }}
                  >
                    {existingBooking.sessionDuration || 45} min
                  </Text>
                </View>
              </View>
            </View>

            <View
              style={{
                height: 1,
                backgroundColor: isDark ? colors.border : "#f0f4f0",
                marginBottom: 14,
              }}
            />

            {/* Scheduled */}
            {existingBooking.scheduledAt ? (
              <>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 14,
                  }}
                >
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 12,
                      backgroundColor: colors.primary + "14",
                      alignItems: "center",
                      justifyContent: "center",
                      marginRight: 10,
                    }}
                  >
                    <Calendar size={18} color={colors.primary} />
                  </View>
                  <View>
                    <Text style={{ fontSize: 12, color: colors.muted }}>
                      Scheduled
                    </Text>
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "700",
                        color: colors.text,
                      }}
                    >
                      {scheduledDateStr}
                    </Text>
                    <Text style={{ fontSize: 13, color: colors.muted }}>
                      {scheduledTimeStr}
                    </Text>
                  </View>
                </View>
                <View
                  style={{
                    height: 1,
                    backgroundColor: isDark ? colors.border : "#f0f4f0",
                    marginBottom: 14,
                  }}
                />
              </>
            ) : null}

            {/* Amount + Payment */}
            <View style={{ flexDirection: "row" }}>
              <View
                style={{ flex: 1, flexDirection: "row", alignItems: "center" }}
              >
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 12,
                    backgroundColor: colors.primary + "14",
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 10,
                  }}
                >
                  <Wallet size={18} color={colors.primary} />
                </View>
                <View>
                  <Text style={{ fontSize: 12, color: colors.muted }}>
                    Amount
                  </Text>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "700",
                      color: colors.text,
                    }}
                  >
                    {existingBooking.isSubscriptionBooking
                      ? "Free"
                      : `₹${Number(existingBooking.amount || 0).toLocaleString("en-IN")}`}
                  </Text>
                </View>
              </View>
              <View
                style={{ flex: 1, flexDirection: "row", alignItems: "center" }}
              >
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 12,
                    backgroundColor: paymentColor + "14",
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 10,
                  }}
                >
                  <CheckCircle size={18} color={paymentColor} />
                </View>
                <View>
                  <Text style={{ fontSize: 12, color: colors.muted }}>
                    Payment
                  </Text>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "700",
                      color: paymentColor,
                    }}
                  >
                    {paymentLabel}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Ready to Join / In Progress Banner */}
          {(canJoin || isConfirmedWithCounsellor) && (
            <TouchableOpacity
              onPress={handleJoinSession}
              activeOpacity={0.88}
              style={{
                backgroundColor: warningBg,
                borderRadius: 18,
                padding: 16,
                marginBottom: 14,
                flexDirection: "row",
                alignItems: "center",
                borderWidth: 1,
                borderColor: warningBorder,
              }}
            >
              <View
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 23,
                  backgroundColor: warningIconBg,
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 14,
                }}
              >
                <Video size={22} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "700",
                    color: colors.accent,
                    marginBottom: 2,
                  }}
                >
                  {canJoin ? "Join Now" : "Ready to Join"}
                </Text>
                <Text
                  style={{ fontSize: 12, color: warningText, lineHeight: 17 }}
                >
                  {canJoin
                    ? "Your session is in progress."
                    : "Waiting for counsellor to join."}
                </Text>
              </View>
              <ChevronRight size={18} color={colors.accent} />
            </TouchableOpacity>
          )}

          {/* Pending Banner */}
          {isPending && existingBooking.status === "pending" && (
            <View
              style={{
                backgroundColor: warningBg,
                borderRadius: 18,
                padding: 14,
                marginBottom: 14,
                borderWidth: 1,
                borderColor: warningBorder,
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <ActivityIndicator
                size="small"
                color={colors.accent}
                style={{ marginRight: 12 }}
              />
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "700",
                    color: colors.accent,
                    marginBottom: 2,
                  }}
                >
                  Waiting for assignment...
                </Text>
                <Text
                  style={{ fontSize: 12, color: warningText, lineHeight: 17 }}
                >
                  You will be notified when a counsellor accepts
                </Text>
              </View>
            </View>
          )}

          {/* Secure Footer */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              marginTop: 8,
            }}
          >
            <ShieldCheck
              size={13}
              color={colors.muted}
              style={{ marginRight: 5 }}
            />
            <Text
              style={{ fontSize: 12, color: colors.muted, fontWeight: "500" }}
            >
              Secure booking
            </Text>
          </View>
          <Text
            style={{
              fontSize: 11,
              color: colors.muted,
              textAlign: "center",
              marginTop: 2,
            }}
          >
            Review the counsellor, time, rate, and payment details before confirming.
          </Text>
        </ScrollView>

        {/* Fixed Bottom CTA */}
        {showJoinButton && (
          <View
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              paddingHorizontal: 16,
              paddingBottom: 24,
              paddingTop: 12,
              backgroundColor: pageBg,
            }}
          >
            <TouchableOpacity
              onPress={handleJoinSession}
              activeOpacity={0.9}
              style={{
                backgroundColor: colors.primary,
                paddingVertical: 16,
                borderRadius: 50,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Video
                size={20}
                color={primaryActionText}
                style={{ marginRight: 10 }}
              />
              <Text
                style={{
                  color: primaryActionText,
                  fontSize: 17,
                  fontWeight: "800",
                  letterSpacing: 0.2,
                }}
              >
                Join Session
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  // Direct counsellor booking flow (from CounsellorProfile)
  if (counsellorId && !bookingId) {
    const displayDuration = Number(directDuration) || 60;
    const displayHourlyRate = Number(hourlyRate) || 0;
    const displayAmount = Math.round(
      (displayHourlyRate * displayDuration) / 60,
    );
    const durationHours = displayDuration / 60;
    const durationLabel = `${durationHours} ${durationHours === 1 ? "hour" : "hours"}`;
    const hourlyRateLabel = `₹${displayHourlyRate.toLocaleString("en-IN")}`;
    const displayAmountLabel = `₹${displayAmount.toLocaleString("en-IN")}`;
    const displayDate = directScheduledAt
      ? new Date(directScheduledAt).toLocaleString("en-IN", {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "To be confirmed";

    const handleConfirmDirectBooking = () => {
      Alert.alert(
        "Confirm Booking",
        `Book a ${durationLabel} session with ${counsellorName} for ${displayAmountLabel}?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Confirm",
            onPress: async () => {
              setIsCreatingBooking(true);
              try {
                const scheduledAt =
                  directScheduledAt ||
                  (() => {
                    const d = new Date();
                    d.setDate(d.getDate() + 1);
                    d.setHours(10, 0, 0, 0);
                    return d.toISOString();
                  })();

                const bookingResponse = await api.createBooking({
                  counsellorId,
                  sessionType: directSessionType || "video",
                  sessionDuration: displayDuration,
                  scheduledAt,
                });

                if (
                  bookingResponse.success &&
                  bookingResponse.data?.booking?.id
                ) {
                  const createdBooking = bookingResponse.data.booking;
                  if (isSubscriptionAuthorizedBooking(createdBooking)) {
                    navigation.replace("BookingSuccess", {
                      bookingId: createdBooking.id,
                      isSubscriptionBooking: true,
                    });
                    return;
                  }
                  // TODO(App Store): This Razorpay flow should remain limited to real-world one-to-one service booking.
                  // It must not unlock digital subscriptions, premium content, or app-only features.
                  navigation.navigate("PaymentSheet", {
                    bookingId: createdBooking.id,
                    paymentMethod: "razorpay",
                  });
                } else {
                  const message = /slot|booked|pending/i.test(
                    bookingResponse.message || "",
                  )
                    ? "This time slot was just booked by someone else. Please choose another available slot."
                    : bookingResponse.message ||
                      "Failed to create booking. Please try again.";
                  Alert.alert("Error", message);
                }
              } catch (error: any) {
                reportError("booking.direct_creation_failed", error);
                Alert.alert(
                  "Error",
                  "Failed to create booking. Please try again.",
                );
              } finally {
                setIsCreatingBooking(false);
              }
            },
          },
        ],
      );
    };

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flex: 1 }}>
          <View
            style={{
              backgroundColor: colors.primaryDark,
              paddingHorizontal: 16,
              paddingTop: 16,
              paddingBottom: 20,
            }}
          >
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={{ marginBottom: 12 }}
            >
              <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 14 }}>
                ← Back
              </Text>
            </TouchableOpacity>
            <Text style={{ color: "white", fontSize: 22, fontWeight: "700" }}>
              Review Booking
            </Text>
            <Text
              style={{
                color: "rgba(255,255,255,0.75)",
                fontSize: 14,
                marginTop: 4,
              }}
            >
              Confirm your session details
            </Text>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 20, gap: 16 }}
          >
            <View
              style={{
                backgroundColor: colors.card,
                borderRadius: 16,
                padding: 20,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  color: colors.muted,
                  fontWeight: "600",
                  textTransform: "uppercase",
                  letterSpacing: 0.8,
                  marginBottom: 14,
                }}
              >
                Counsellor
              </Text>
              <Text
                style={{ fontSize: 20, fontWeight: "700", color: colors.text }}
              >
                {counsellorName}
              </Text>
            </View>

            <View
              style={{
                backgroundColor: colors.card,
                borderRadius: 16,
                padding: 20,
                borderWidth: 1,
                borderColor: colors.border,
                gap: 14,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  color: colors.muted,
                  fontWeight: "600",
                  textTransform: "uppercase",
                  letterSpacing: 0.8,
                }}
              >
                Session Details
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                <Text style={{ color: colors.muted, fontSize: 14 }}>Type</Text>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 14,
                    fontWeight: "600",
                    textTransform: "capitalize",
                  }}
                >
                  {directSessionType || "Video"}
                </Text>
              </View>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                <Text style={{ color: colors.muted, fontSize: 14 }}>
                  Duration
                </Text>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 14,
                    fontWeight: "600",
                  }}
                >
                  {durationLabel}
                </Text>
              </View>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                <Text style={{ color: colors.muted, fontSize: 14 }}>
                  Counsellor rate
                </Text>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 14,
                    fontWeight: "600",
                  }}
                >
                  {hourlyRateLabel}/hour
                </Text>
              </View>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                <Text style={{ color: colors.muted, fontSize: 14 }}>
                  Scheduled
                </Text>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 14,
                    fontWeight: "600",
                  }}
                >
                  {displayDate}
                </Text>
              </View>
              <View style={{ height: 1, backgroundColor: colors.border }} />
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                <Text style={{ color: colors.muted, fontSize: 16 }}>Total</Text>
                <View style={{ alignItems: "flex-end" }}>
                  <Text
                    style={{
                      color: colors.primary,
                      fontSize: 20,
                      fontWeight: "700",
                    }}
                  >
                    {displayAmountLabel}
                  </Text>
                  <Text
                    style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}
                  >
                    {hourlyRateLabel} × {durationLabel}
                  </Text>
                </View>
              </View>
            </View>
          </ScrollView>

          <View style={{ padding: 20, paddingBottom: 32 }}>
            <TouchableOpacity
              onPress={handleConfirmDirectBooking}
              disabled={isCreatingBooking}
              style={{
                backgroundColor: isCreatingBooking
                  ? colors.muted
                  : colors.primary,
                borderRadius: 14,
                paddingVertical: 16,
                alignItems: "center",
              }}
            >
              {isCreatingBooking ? (
                <ActivityIndicator color={primaryActionText} />
              ) : (
                <Text
                  style={{
                    color: primaryActionText,
                    fontSize: 16,
                    fontWeight: "700",
                  }}
                >
                  Confirm & Pay {displayAmountLabel}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          padding: 24,
        }}
      >
        <Text
          style={{
            color: colors.text,
            fontSize: 18,
            fontWeight: "700",
            textAlign: "center",
          }}
        >
          Choose a counsellor to start booking
        </Text>
        <Text
          style={{
            color: colors.muted,
            fontSize: 14,
            lineHeight: 20,
            textAlign: "center",
            marginTop: 8,
          }}
        >
          Session pricing is based on the counsellor’s hourly rate and the
          duration you select.
        </Text>
        <TouchableOpacity
          onPress={() => navigation.replace("CounsellorList")}
          style={{
            backgroundColor: colors.primary,
            paddingHorizontal: 24,
            paddingVertical: 14,
            borderRadius: 12,
            marginTop: 20,
          }}
        >
          <Text
            style={{
              color: primaryActionText,
              fontSize: 15,
              fontWeight: "700",
            }}
          >
            Browse Counsellors
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
