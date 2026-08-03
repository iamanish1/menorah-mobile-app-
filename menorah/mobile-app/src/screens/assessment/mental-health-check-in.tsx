import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowLeft,
  CalendarHeart,
  Check,
  ChevronRight,
  ClipboardCheck,
  ShieldCheck,
} from "lucide-react-native";
import { v4 as uuidv4 } from "uuid";
import { IOSCard, IOSScreen, useIOSTheme } from "@/components/ios";
import {
  api,
  type Gad7Instrument,
  type PsychometricAssessmentResult,
} from "@/lib/api";
import {
  GAD7_DISCLAIMER,
  GAD7_QUESTION_COUNT,
  GAD7_RESULT_NOTICE,
  canAdvance,
  canSubmit,
  createInitialAnswers,
  setAnswer,
  submissionSignature,
  toSubmissionAnswers,
} from "@/lib/gad7-assessment";

type Stage = "intro" | "questions" | "result";
type SubmissionAttempt = { signature: string; key: string };

export default function MentalHealthCheckIn({ navigation }: any) {
  const iosTheme = useIOSTheme();
  const insets = useSafeAreaInsets();
  const [stage, setStage] = useState<Stage>("intro");
  const [instrument, setInstrument] = useState<Gad7Instrument | null>(null);
  const [instrumentLoading, setInstrumentLoading] = useState(true);
  const [instrumentError, setInstrumentError] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Array<number | null>>(
    createInitialAnswers(),
  );
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<PsychometricAssessmentResult | null>(
    null,
  );
  const submittingRef = useRef(false);
  const submissionAttemptRef = useRef<SubmissionAttempt | null>(null);

  const loadInstrument = useCallback(async () => {
    setInstrumentLoading(true);
    setInstrumentError(false);
    const response = await api.getGad7Instrument();
    if (
      response.success &&
      response.data?.instrument?.questions?.length === GAD7_QUESTION_COUNT &&
      response.data.instrument.responses?.length === 4 &&
      response.data.instrument.language === "en"
    ) {
      setInstrument(response.data.instrument);
      setInstrumentLoading(false);
      return;
    }
    setInstrument(null);
    setInstrumentError(true);
    setInstrumentLoading(false);
  }, []);

  useEffect(() => {
    void loadInstrument();
  }, [loadInstrument]);

  const goBack = () => {
    if (stage === "questions") {
      if (questionIndex > 0) {
        setQuestionIndex((current) => current - 1);
      } else {
        setStage("intro");
      }
      return;
    }
    navigation.goBack();
  };

  const startAssessment = () => {
    if (!instrument || instrumentLoading) return;
    setAnswers(createInitialAnswers(instrument.questions.length));
    setQuestionIndex(0);
    setResult(null);
    submissionAttemptRef.current = null;
    setStage("questions");
  };

  const selectAnswer = (value: number) => {
    setAnswers((current) => setAnswer(current, questionIndex, value));
  };

  const nextQuestion = () => {
    if (!canAdvance(answers, questionIndex)) return;
    if (questionIndex < GAD7_QUESTION_COUNT - 1) {
      setQuestionIndex((current) => current + 1);
    }
  };

  const submitAssessment = async () => {
    if (submittingRef.current || !instrument || !canSubmit(answers)) {
      if (!canSubmit(answers)) {
        Alert.alert(
          "Complete every question",
          "Please answer all seven questions before submitting.",
        );
      }
      return;
    }

    const requestAnswers = toSubmissionAnswers(answers);
    const signature = submissionSignature(answers);
    if (!requestAnswers || !signature) return;

    if (submissionAttemptRef.current?.signature !== signature) {
      submissionAttemptRef.current = {
        signature,
        key: `gad7-${uuidv4()}`,
      };
    }

    submittingRef.current = true;
    setSubmitting(true);
    try {
      const response = await api.submitGad7Assessment(
        instrument.assessmentVersion,
        requestAnswers,
        submissionAttemptRef.current.key,
      );
      if (response.success && response.data?.assessment) {
        setResult(response.data.assessment);
        setStage("result");
        return;
      }
      Alert.alert(
        "Couldn’t submit check-in",
        "Your answers were not submitted. Please check your connection and try again.",
      );
    } catch {
      Alert.alert(
        "Couldn’t submit check-in",
        "Your answers were not submitted. Please check your connection and try again.",
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const renderIntro = () => (
    <View style={{ gap: iosTheme.spacing.xl }}>
      <IOSCard>
        <View style={{ alignItems: "center", gap: iosTheme.spacing.lg }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 22,
              backgroundColor: iosTheme.colors.surfaceAlt,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ClipboardCheck
              size={30}
              color={iosTheme.colors.primary}
              strokeWidth={2.1}
            />
          </View>
          <View style={{ alignItems: "center", gap: iosTheme.spacing.sm }}>
            <Text
              selectable
              style={[
                iosTheme.typography.sectionTitle,
                { textAlign: "center" },
              ]}
            >
              Mental Health Check-in
            </Text>
            <Text
              selectable
              style={[iosTheme.typography.body, { textAlign: "center" }]}
            >
              Seven questions about how you have been feeling over the last two
              weeks.
            </Text>
          </View>
        </View>
      </IOSCard>

      <IOSCard>
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            gap: iosTheme.spacing.md,
          }}
        >
          <ShieldCheck
            size={22}
            color={iosTheme.colors.primary}
            strokeWidth={2.2}
          />
          <View style={{ flex: 1, gap: iosTheme.spacing.xs }}>
            <Text selectable style={iosTheme.typography.cardTitle}>
              Before you begin
            </Text>
            <Text selectable style={iosTheme.typography.body}>
              {instrument?.disclaimer || GAD7_DISCLAIMER}
            </Text>
          </View>
        </View>
      </IOSCard>

      {instrumentError ? (
        <IOSCard>
          <Text selectable style={iosTheme.typography.cardTitle}>
            Check-in could not load
          </Text>
          <Text
            selectable
            style={[
              iosTheme.typography.body,
              { marginTop: iosTheme.spacing.xs },
            ]}
          >
            Check your connection, then try again.
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => void loadInstrument()}
            style={{ paddingTop: iosTheme.spacing.lg }}
          >
            <Text
              style={{
                color: iosTheme.colors.primary,
                fontSize: 15,
                fontWeight: "800",
              }}
            >
              Try again
            </Text>
          </TouchableOpacity>
        </IOSCard>
      ) : null}

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Start mental health check-in"
        disabled={!instrument || instrumentLoading}
        onPress={startAssessment}
        activeOpacity={0.86}
        style={[
          {
            minHeight: 56,
            borderRadius: iosTheme.radius.pill,
            backgroundColor: iosTheme.colors.primary,
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            gap: iosTheme.spacing.sm,
            opacity: !instrument || instrumentLoading ? 0.55 : 1,
          },
          iosTheme.shadows.button,
        ]}
      >
        {instrumentLoading ? (
          <ActivityIndicator color={iosTheme.colors.onPrimary} />
        ) : (
          <>
            <Text
              style={{
                color: iosTheme.colors.onPrimary,
                fontSize: 16,
                fontWeight: "900",
              }}
            >
              Start Check-in
            </Text>
            <ChevronRight
              size={18}
              color={iosTheme.colors.onPrimary}
              strokeWidth={2.5}
            />
          </>
        )}
      </TouchableOpacity>
    </View>
  );

  const renderQuestions = () => {
    if (!instrument) return null;
    const question = instrument.questions[questionIndex];
    const selectedValue = answers[questionIndex];
    const isFinalQuestion = questionIndex === GAD7_QUESTION_COUNT - 1;
    const currentAnswered = canAdvance(answers, questionIndex);
    const submitEnabled = canSubmit(answers) && !submitting;
    const progress = ((questionIndex + 1) / GAD7_QUESTION_COUNT) * 100;

    return (
      <View style={{ gap: iosTheme.spacing.xl }}>
        <View style={{ gap: iosTheme.spacing.sm }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Text
              selectable
              accessibilityLiveRegion="polite"
              style={[
                iosTheme.typography.caption,
                { fontVariant: ["tabular-nums"] },
              ]}
            >
              Question {questionIndex + 1} of {GAD7_QUESTION_COUNT}
            </Text>
            <Text selectable style={iosTheme.typography.caption}>
              GAD-7
            </Text>
          </View>
          <View
            style={{
              height: 7,
              borderRadius: iosTheme.radius.pill,
              backgroundColor: iosTheme.colors.surfaceAlt,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                width: `${progress}%`,
                height: "100%",
                borderRadius: iosTheme.radius.pill,
                backgroundColor: iosTheme.colors.primary,
              }}
            />
          </View>
        </View>

        <IOSCard>
          <Text selectable style={iosTheme.typography.caption}>
            {instrument.timeframe}
          </Text>
          <Text
            selectable
            style={[
              iosTheme.typography.sectionTitle,
              { marginTop: iosTheme.spacing.lg },
            ]}
          >
            {question.prompt}
          </Text>
        </IOSCard>

        <View style={{ gap: iosTheme.spacing.md }}>
          {instrument.responses.map((response) => {
            const selected = selectedValue === response.value;
            return (
              <TouchableOpacity
                key={response.value}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={response.label}
                activeOpacity={0.86}
                onPress={() => selectAnswer(response.value)}
                style={[
                  {
                    minHeight: 60,
                    borderRadius: iosTheme.radius.lg,
                    borderWidth: 1.5,
                    borderColor: selected
                      ? iosTheme.colors.primary
                      : iosTheme.colors.border,
                    backgroundColor: selected
                      ? iosTheme.colors.surfaceAlt
                      : iosTheme.colors.surface,
                    paddingHorizontal: iosTheme.spacing.lg,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: iosTheme.spacing.md,
                  },
                  iosTheme.shadows.card,
                ]}
              >
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor: selected
                      ? iosTheme.colors.primary
                      : iosTheme.colors.textMuted,
                    backgroundColor: selected
                      ? iosTheme.colors.primary
                      : "transparent",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {selected ? (
                    <Check
                      size={14}
                      color={iosTheme.colors.onPrimary}
                      strokeWidth={3}
                    />
                  ) : null}
                </View>
                <Text
                  selectable
                  style={{
                    flex: 1,
                    color: iosTheme.colors.text,
                    fontSize: 15,
                    lineHeight: 21,
                    fontWeight: selected ? "800" : "600",
                  }}
                >
                  {response.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: iosTheme.spacing.md,
          }}
        >
          <TouchableOpacity
            accessibilityRole="button"
            onPress={goBack}
            style={{
              minHeight: 54,
              flex: 1,
              borderRadius: iosTheme.radius.pill,
              borderWidth: 1.5,
              borderColor: iosTheme.colors.border,
              backgroundColor: iosTheme.colors.surface,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                color: iosTheme.colors.text,
                fontSize: 15,
                fontWeight: "800",
              }}
            >
              Back
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{
              disabled: isFinalQuestion ? !submitEnabled : !currentAnswered,
            }}
            disabled={
              isFinalQuestion ? !submitEnabled : !currentAnswered || submitting
            }
            onPress={
              isFinalQuestion ? () => void submitAssessment() : nextQuestion
            }
            style={[
              {
                minHeight: 54,
                flex: 1.6,
                borderRadius: iosTheme.radius.pill,
                backgroundColor: iosTheme.colors.primary,
                alignItems: "center",
                justifyContent: "center",
                opacity:
                  (isFinalQuestion ? !submitEnabled : !currentAnswered) ||
                  submitting
                    ? 0.5
                    : 1,
              },
              iosTheme.shadows.button,
            ]}
          >
            {submitting ? (
              <ActivityIndicator color={iosTheme.colors.onPrimary} />
            ) : (
              <Text
                style={{
                  color: iosTheme.colors.onPrimary,
                  fontSize: 15,
                  fontWeight: "900",
                }}
              >
                {isFinalQuestion ? "Submit" : "Next"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderResult = () => {
    if (!result) return null;
    return (
      <View style={{ gap: iosTheme.spacing.xl }}>
        <IOSCard>
          <View style={{ alignItems: "center", gap: iosTheme.spacing.lg }}>
            <View
              style={{
                width: 68,
                height: 68,
                borderRadius: 24,
                backgroundColor: iosTheme.colors.surfaceAlt,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CalendarHeart
                size={31}
                color={iosTheme.colors.primary}
                strokeWidth={2.1}
              />
            </View>
            <Text selectable style={iosTheme.typography.sectionTitle}>
              Check-in complete
            </Text>
            <View
              style={{
                width: "100%",
                flexDirection: "row",
                gap: iosTheme.spacing.md,
              }}
            >
              <View
                style={{
                  flex: 1,
                  padding: iosTheme.spacing.lg,
                  borderRadius: iosTheme.radius.lg,
                  backgroundColor: iosTheme.colors.surfaceAlt,
                  alignItems: "center",
                  gap: iosTheme.spacing.xs,
                }}
              >
                <Text
                  selectable
                  style={{
                    color: iosTheme.colors.primary,
                    fontSize: 31,
                    lineHeight: 36,
                    fontWeight: "900",
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {result.totalScore}
                </Text>
                <Text selectable style={iosTheme.typography.caption}>
                  TOTAL SCORE
                </Text>
              </View>
              <View
                style={{
                  flex: 1.3,
                  padding: iosTheme.spacing.lg,
                  borderRadius: iosTheme.radius.lg,
                  backgroundColor: iosTheme.colors.surfaceAlt,
                  alignItems: "center",
                  justifyContent: "center",
                  gap: iosTheme.spacing.xs,
                }}
              >
                <Text
                  selectable
                  style={{
                    color: iosTheme.colors.primary,
                    fontSize: 20,
                    lineHeight: 25,
                    fontWeight: "900",
                  }}
                >
                  {result.severityCategory}
                </Text>
                <Text selectable style={iosTheme.typography.caption}>
                  SEVERITY
                </Text>
              </View>
            </View>
          </View>
        </IOSCard>

        <IOSCard>
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              gap: iosTheme.spacing.md,
            }}
          >
            <ShieldCheck
              size={21}
              color={iosTheme.colors.primary}
              strokeWidth={2.2}
            />
            <Text selectable style={[iosTheme.typography.body, { flex: 1 }]}>
              {instrument?.resultNotice || GAD7_RESULT_NOTICE}
            </Text>
          </View>
        </IOSCard>

        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => navigation.navigate("CounsellorList")}
          activeOpacity={0.86}
          style={[
            {
              minHeight: 56,
              borderRadius: iosTheme.radius.pill,
              backgroundColor: iosTheme.colors.primary,
              alignItems: "center",
              justifyContent: "center",
            },
            iosTheme.shadows.button,
          ]}
        >
          <Text
            style={{
              color: iosTheme.colors.onPrimary,
              fontSize: 16,
              fontWeight: "900",
            }}
          >
            Book a Counsellor
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => navigation.goBack()}
          style={{
            minHeight: 54,
            borderRadius: iosTheme.radius.pill,
            borderWidth: 1.5,
            borderColor: iosTheme.colors.border,
            backgroundColor: iosTheme.colors.surface,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              color: iosTheme.colors.text,
              fontSize: 15,
              fontWeight: "800",
            }}
          >
            Done
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: iosTheme.colors.background }}>
      <View
        style={{
          paddingTop: insets.top + iosTheme.spacing.sm,
          paddingHorizontal: iosTheme.layout.screenPadding,
          paddingBottom: iosTheme.spacing.md,
          flexDirection: "row",
          alignItems: "center",
          gap: iosTheme.spacing.md,
        }}
      >
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={goBack}
          style={{
            width: 42,
            height: 42,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: iosTheme.colors.border,
            backgroundColor: iosTheme.colors.surface,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ArrowLeft size={20} color={iosTheme.colors.text} strokeWidth={2.3} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text
            selectable
            style={{
              color: iosTheme.colors.text,
              fontSize: 21,
              lineHeight: 27,
              fontWeight: "900",
            }}
          >
            Mental Health Check-in
          </Text>
          <Text selectable style={iosTheme.typography.caption}>
            English · GAD-7
          </Text>
        </View>
      </View>

      <IOSScreen
        edges={["right", "bottom", "left"]}
        contentContainerStyle={{
          paddingTop: iosTheme.spacing.md,
          paddingBottom: insets.bottom + iosTheme.spacing.xxxl,
        }}
      >
        {stage === "intro" ? renderIntro() : null}
        {stage === "questions" ? renderQuestions() : null}
        {stage === "result" ? renderResult() : null}
      </IOSScreen>
    </View>
  );
}
