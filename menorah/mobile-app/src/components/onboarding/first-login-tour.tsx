import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AccessibilityInfo,
  Modal,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  CheckCircle2,
  MessageCircle,
  Search,
  User,
  X,
} from "lucide-react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useIOSTheme } from "@/components/ios/iosTheme";
import { reportError } from "@/lib/safeDiagnostics";
import { useAuth } from "@/state/useAuth";

export type MobileTourRoute = "Discover" | "Bookings" | "Chat" | "Profile";

type TourStep = {
  route: MobileTourRoute;
  title: string;
  body: string;
  features: [string, string];
};

type FirstLoginTourProps = {
  onNavigate: (route: MobileTourRoute) => void;
};

const TOUR_STORAGE_KEY = "menorah-mobile-user-tour-v1";
const TAB_BAR_HEIGHT = 74;
const TOUR_OPEN_DELAY_MS = 700;
const FLOATING_TAB_HORIZONTAL_INSET = 4;
const FLOATING_TAB_LIFT = 14;

const TOUR_TAB_PRESENTATION = {
  Discover: { label: "Discover", Icon: Search },
  Bookings: { label: "Bookings", Icon: Calendar },
  Chat: { label: "Chat", Icon: MessageCircle },
  Profile: { label: "Profile", Icon: User },
} as const;

export const MOBILE_TOUR_STEPS: readonly TourStep[] = [
  {
    route: "Discover",
    title: "Discover support",
    body: "Start here whenever you want to explore the care and guidance available in Menorah.",
    features: [
      "Find counsellors and session options",
      "Read articles and check important alerts",
    ],
  },
  {
    route: "Bookings",
    title: "Keep sessions organised",
    body: "Your booking history and upcoming appointments stay together in one private, predictable place.",
    features: [
      "Review upcoming and completed sessions",
      "Check booking and payment status",
    ],
  },
  {
    route: "Chat",
    title: "Continue conversations",
    body: "Return to your support conversations without having to search through the rest of the app.",
    features: [
      "Open your counselling conversations",
      "See new-message updates",
    ],
  },
  {
    route: "Profile",
    title: "Manage your account",
    body: "Use Profile for the details and controls that make Menorah work the way you need it to.",
    features: [
      "Edit your account and preferences",
      "Open privacy, support, and crisis resources",
    ],
  },
] as const;

const buildTourStorageKey = (userId: string) => `${TOUR_STORAGE_KEY}:${userId}`;

export function FirstLoginTour({ onNavigate }: FirstLoginTourProps) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const iosTheme = useIOSTheme();
  const { width, height } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const reduceMotion = useReducedMotion();

  const storageKey = user?.id ? buildTourStorageKey(user.id) : null;
  const currentStep = MOBILE_TOUR_STEPS[stepIndex] ?? MOBILE_TOUR_STEPS[0];
  const lastStep = stepIndex === MOBILE_TOUR_STEPS.length - 1;

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    setOpen(false);
    setStepIndex(0);

    if (!storageKey) return () => undefined;

    AsyncStorage.getItem(storageKey)
      .then((completedAt) => {
        if (!active || completedAt) return;
        timer = setTimeout(() => {
          if (active) setOpen(true);
        }, TOUR_OPEN_DELAY_MS);
      })
      .catch((error) => {
        reportError("onboarding.mobile_tour_storage_read_failed", error);
        timer = setTimeout(() => {
          if (active) setOpen(true);
        }, TOUR_OPEN_DELAY_MS);
      });

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [storageKey]);

  useEffect(() => {
    if (!open) return;

    onNavigate(currentStep.route);
    AccessibilityInfo.announceForAccessibility(
      `${stepIndex + 1} of ${MOBILE_TOUR_STEPS.length}. ${currentStep.title}. ${currentStep.body}`,
    );
  }, [currentStep, onNavigate, open, stepIndex]);

  const dismiss = useCallback(() => {
    setOpen(false);
    if (!storageKey) return;

    AsyncStorage.setItem(storageKey, new Date().toISOString()).catch(
      (error) => {
        reportError("onboarding.mobile_tour_storage_write_failed", error);
      },
    );
  }, [storageKey]);

  const tabGeometry = useMemo(() => {
    const horizontalInset = iosTheme.spacing.lg;
    const bottomOffset =
      insets.bottom > 0
        ? insets.bottom + iosTheme.spacing.xs
        : iosTheme.spacing.lg;
    const availableWidth = Math.max(0, width - horizontalInset * 2);
    const tabWidth = availableWidth / MOBILE_TOUR_STEPS.length;

    return {
      bottomOffset,
      left: horizontalInset + tabWidth * stepIndex,
      top: height - bottomOffset - TAB_BAR_HEIGHT,
      width: tabWidth,
      height: TAB_BAR_HEIGHT,
    };
  }, [
    height,
    insets.bottom,
    iosTheme.spacing.lg,
    iosTheme.spacing.xs,
    stepIndex,
    width,
  ]);

  const spotlightGeometry = useMemo(
    () => ({
      left: tabGeometry.left + FLOATING_TAB_HORIZONTAL_INSET,
      top: tabGeometry.top - FLOATING_TAB_LIFT,
      width: Math.max(
        64,
        tabGeometry.width - FLOATING_TAB_HORIZONTAL_INSET * 2,
      ),
      height: TAB_BAR_HEIGHT + FLOATING_TAB_LIFT,
    }),
    [tabGeometry.left, tabGeometry.top, tabGeometry.width],
  );

  const floatingTabX = useSharedValue(spotlightGeometry.left);
  const floatingTabY = useSharedValue(10);
  const floatingTabScale = useSharedValue(0.9);
  const floatingTabOpacity = useSharedValue(0);
  const haloScale = useSharedValue(0.92);
  const haloOpacity = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(floatingTabX);
    cancelAnimation(floatingTabY);
    cancelAnimation(floatingTabScale);
    cancelAnimation(floatingTabOpacity);
    cancelAnimation(haloScale);
    cancelAnimation(haloOpacity);

    if (!open) {
      floatingTabX.value = spotlightGeometry.left;
      floatingTabY.value = 10;
      floatingTabScale.value = 0.9;
      floatingTabOpacity.value = 0;
      haloScale.value = 0.92;
      haloOpacity.value = 0;
      return;
    }

    if (reduceMotion) {
      floatingTabX.value = spotlightGeometry.left;
      floatingTabY.value = 0;
      floatingTabScale.value = 1;
      floatingTabOpacity.value = 1;
      haloScale.value = 1;
      haloOpacity.value = 0.42;
      return;
    }

    floatingTabY.value = 8;
    floatingTabScale.value = 0.92;
    haloScale.value = 0.9;
    haloOpacity.value = 0;

    floatingTabX.value = withSpring(spotlightGeometry.left, {
      damping: 19,
      stiffness: 220,
      mass: 0.72,
    });
    floatingTabY.value = withSpring(0, {
      damping: 16,
      stiffness: 240,
      mass: 0.65,
    });
    floatingTabScale.value = withSpring(1, {
      damping: 16,
      stiffness: 240,
      mass: 0.65,
    });
    floatingTabOpacity.value = withTiming(1, { duration: 140 });
    haloOpacity.value = withSequence(
      withTiming(0.5, { duration: 140 }),
      withDelay(80, withTiming(0.22, { duration: 160 })),
    );
    haloScale.value = withSequence(
      withTiming(1.08, { duration: 180 }),
      withTiming(1, { duration: 120 }),
    );
  }, [
    floatingTabOpacity,
    floatingTabScale,
    floatingTabX,
    floatingTabY,
    haloOpacity,
    haloScale,
    open,
    reduceMotion,
    spotlightGeometry.left,
  ]);

  const floatingTabStyle = useAnimatedStyle(() => ({
    opacity: floatingTabOpacity.value,
    transform: [
      { translateX: floatingTabX.value },
      { translateY: floatingTabY.value },
      { scale: floatingTabScale.value },
    ],
  }));

  const haloStyle = useAnimatedStyle(() => ({
    opacity: haloOpacity.value,
    transform: [{ scale: haloScale.value }],
  }));

  const cardWidth = Math.min(Math.max(0, width - iosTheme.spacing.xxxl), 390);
  const cardBottom = height - spotlightGeometry.top + iosTheme.spacing.md;
  const cardMaxHeight = Math.max(
    190,
    spotlightGeometry.top - insets.top - iosTheme.spacing.xxl,
  );
  const scrimColor = "rgba(5, 8, 6, 0.58)";
  const { Icon: SpotlightIcon, label: spotlightLabel } =
    TOUR_TAB_PRESENTATION[currentStep.route];

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={dismiss}
    >
      <View
        style={{ flex: 1 }}
        accessibilityViewIsModal
        accessibilityLabel="Menorah first-time app tour"
      >
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ position: "absolute", inset: 0 }}
        >
          <View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              height: Math.max(0, spotlightGeometry.top - iosTheme.spacing.xs),
              backgroundColor: scrimColor,
            }}
          />
          <View
            style={{
              position: "absolute",
              left: 0,
              top: spotlightGeometry.top - iosTheme.spacing.xs,
              width: Math.max(0, spotlightGeometry.left - iosTheme.spacing.xs),
              height: spotlightGeometry.height + iosTheme.spacing.sm,
              backgroundColor: scrimColor,
            }}
          />
          <View
            style={{
              position: "absolute",
              left:
                spotlightGeometry.left +
                spotlightGeometry.width +
                iosTheme.spacing.xs,
              right: 0,
              top: spotlightGeometry.top - iosTheme.spacing.xs,
              height: spotlightGeometry.height + iosTheme.spacing.sm,
              backgroundColor: scrimColor,
            }}
          />
          <View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top:
                spotlightGeometry.top +
                spotlightGeometry.height +
                iosTheme.spacing.xs,
              bottom: 0,
              backgroundColor: scrimColor,
            }}
          />
          <Animated.View
            style={[
              {
                position: "absolute",
                left: 0,
                top: spotlightGeometry.top,
                width: spotlightGeometry.width,
                height: TAB_BAR_HEIGHT,
              },
              floatingTabStyle,
            ]}
          >
            <Animated.View
              style={[
                {
                  position: "absolute",
                  inset: -5,
                  borderRadius: iosTheme.radius.xxl,
                  borderWidth: 2,
                  borderColor: iosTheme.colors.primary,
                  backgroundColor: iosTheme.colors.surfaceAlt,
                },
                haloStyle,
              ]}
            />

            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: iosTheme.radius.xxl,
                borderWidth: 2,
                borderColor: iosTheme.colors.primary,
                backgroundColor: iosTheme.colors.surfaceElevated,
                boxShadow: `0 14px 30px ${iosTheme.colors.shadow}38`,
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: iosTheme.colors.primary,
                  boxShadow: `0 7px 14px ${iosTheme.colors.primary}40`,
                }}
              >
                <SpotlightIcon
                  size={22}
                  color={iosTheme.colors.onPrimary}
                  strokeWidth={2.4}
                />
              </View>
              <Text
                numberOfLines={1}
                style={{
                  color: iosTheme.colors.primary,
                  fontSize: 12,
                  lineHeight: 15,
                  fontWeight: "900",
                  marginTop: 2,
                }}
              >
                {spotlightLabel}
              </Text>
            </View>

            <View
              style={{
                position: "absolute",
                left: "50%",
                bottom: -9,
                width: 24,
                height: 5,
                marginLeft: -12,
                borderRadius: 3,
                backgroundColor: iosTheme.colors.primary,
              }}
            />
          </Animated.View>
        </View>

        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: cardBottom,
            alignItems: "center",
            paddingHorizontal: iosTheme.spacing.lg,
          }}
        >
          <ScrollView
            contentInsetAdjustmentBehavior="automatic"
            bounces={false}
            showsVerticalScrollIndicator={false}
            style={{
              width: cardWidth,
              maxHeight: cardMaxHeight,
              borderRadius: iosTheme.radius.xl,
              backgroundColor: iosTheme.colors.surfaceElevated,
              borderWidth: 1,
              borderColor: iosTheme.colors.border,
              boxShadow: "0 20px 60px rgba(0, 0, 0, 0.28)",
            }}
            contentContainerStyle={{
              padding: iosTheme.spacing.xl,
              gap: iosTheme.spacing.lg,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                gap: iosTheme.spacing.md,
              }}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: iosTheme.colors.surfaceAlt,
                }}
              >
                <CheckCircle2
                  size={22}
                  color={iosTheme.colors.primary}
                  strokeWidth={2.2}
                />
              </View>

              <View style={{ flex: 1, gap: 2 }}>
                <Text
                  style={{
                    color: iosTheme.colors.primaryMuted,
                    fontSize: 12,
                    lineHeight: 16,
                    fontWeight: "900",
                    letterSpacing: 1.2,
                    textTransform: "uppercase",
                  }}
                >
                  Quick app tour
                </Text>
                <Text
                  style={{
                    color: iosTheme.colors.text,
                    fontSize: 22,
                    lineHeight: 28,
                    fontWeight: "900",
                  }}
                >
                  {currentStep.title}
                </Text>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Skip app tour"
                hitSlop={4}
                onPress={dismiss}
                style={({ pressed }) => ({
                  width: 48,
                  height: 48,
                  marginTop: -4,
                  marginRight: -8,
                  borderRadius: 24,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: pressed
                    ? iosTheme.colors.surfaceAlt
                    : "transparent",
                  opacity: pressed ? 0.72 : 1,
                })}
              >
                <X size={20} color={iosTheme.colors.textSecondary} />
              </Pressable>
            </View>

            <Text
              style={{
                color: iosTheme.colors.textSecondary,
                fontSize: 15,
                lineHeight: 23,
              }}
            >
              {currentStep.body}
            </Text>

            <View style={{ gap: iosTheme.spacing.sm }}>
              {currentStep.features.map((feature) => (
                <View
                  key={feature}
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-start",
                    gap: iosTheme.spacing.sm,
                  }}
                >
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: iosTheme.colors.surfaceAlt,
                    }}
                  >
                    <Check
                      size={14}
                      color={iosTheme.colors.primary}
                      strokeWidth={2.5}
                    />
                  </View>
                  <Text
                    style={{
                      flex: 1,
                      color: iosTheme.colors.text,
                      fontSize: 14,
                      lineHeight: 21,
                      fontWeight: "700",
                    }}
                  >
                    {feature}
                  </Text>
                </View>
              ))}
            </View>

            <View
              accessibilityRole="progressbar"
              accessibilityValue={{
                min: 1,
                max: MOBILE_TOUR_STEPS.length,
                now: stepIndex + 1,
              }}
              accessibilityLabel={`Tour step ${stepIndex + 1} of ${MOBILE_TOUR_STEPS.length}`}
              style={{ flexDirection: "row", gap: iosTheme.spacing.sm }}
            >
              {MOBILE_TOUR_STEPS.map((step, index) => (
                <View
                  key={step.route}
                  style={{
                    flex: 1,
                    height: 5,
                    borderRadius: 3,
                    backgroundColor:
                      index <= stepIndex
                        ? iosTheme.colors.primary
                        : iosTheme.colors.surfaceAlt,
                  }}
                />
              ))}
            </View>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Skip app tour"
                onPress={dismiss}
                style={({ pressed }) => ({
                  minHeight: 48,
                  justifyContent: "center",
                  paddingHorizontal: iosTheme.spacing.sm,
                  opacity: pressed ? 0.58 : 1,
                })}
              >
                <Text
                  style={{
                    color: iosTheme.colors.textSecondary,
                    fontSize: 14,
                    fontWeight: "800",
                  }}
                >
                  Skip
                </Text>
              </Pressable>

              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                {stepIndex > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Previous tour step"
                    onPress={() =>
                      setStepIndex((value) => Math.max(0, value - 1))
                    }
                    style={({ pressed }) => ({
                      minHeight: 48,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      paddingHorizontal: iosTheme.spacing.md,
                      borderRadius: iosTheme.radius.pill,
                      backgroundColor: iosTheme.colors.surfaceAlt,
                      opacity: pressed ? 0.72 : 1,
                    })}
                  >
                    <ArrowLeft size={17} color={iosTheme.colors.text} />
                    <Text
                      style={{
                        color: iosTheme.colors.text,
                        fontSize: 14,
                        fontWeight: "900",
                      }}
                    >
                      Back
                    </Text>
                  </Pressable>
                ) : null}

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    lastStep ? "Finish app tour" : "Next tour step"
                  }
                  onPress={() => {
                    if (lastStep) dismiss();
                    else
                      setStepIndex((value) =>
                        Math.min(MOBILE_TOUR_STEPS.length - 1, value + 1),
                      );
                  }}
                  style={({ pressed }) => ({
                    minHeight: 48,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    paddingHorizontal: iosTheme.spacing.lg,
                    borderRadius: iosTheme.radius.pill,
                    backgroundColor: iosTheme.colors.primary,
                    opacity: pressed ? 0.78 : 1,
                  })}
                >
                  <Text
                    style={{
                      color: iosTheme.colors.onPrimary,
                      fontSize: 14,
                      fontWeight: "900",
                    }}
                  >
                    {lastStep ? "Done" : "Next"}
                  </Text>
                  {lastStep ? (
                    <Check size={17} color={iosTheme.colors.onPrimary} />
                  ) : (
                    <ArrowRight size={17} color={iosTheme.colors.onPrimary} />
                  )}
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
