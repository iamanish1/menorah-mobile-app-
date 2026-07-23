import { Alert, Linking, Text, TouchableOpacity, View } from 'react-native';
import { useEffect, useMemo, useState } from 'react';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import {
  AlertTriangle,
  BadgeCheck,
  Camera,
  CheckSquare,
  ChevronRight,
  ShieldCheck,
  Square,
} from 'lucide-react-native';
import {
  IOSButton,
  IOSCard,
  IOSHeader,
  IOSScreen,
  IOSSectionHeader,
  useIOSTheme,
} from '@/components/ios';
import { api, type KycStatus, type ProfileImageUpload } from '@/lib/api';
import {
  FACE_CHECK_CONSENT_TEXT,
  FACE_CHECK_CONSENT_VERSION,
  FACE_CHECK_NOTICE_SECTIONS,
  LUXAND_PRIVACY_POLICY_URL,
  MENORAH_PRIVACY_POLICY_URL,
} from '@/lib/faceCheckNotice';
import { useAuth } from '@/state/useAuth';
import { reportError } from '@/lib/safeDiagnostics';

type ImageSlotProps = {
  title: string;
  subtitle: string;
  image?: ProfileImageUpload | null;
  icon: typeof Camera;
  onPress: () => void;
};

const statusCopy: Record<KycStatus, { title: string; body: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  not_started: {
    title: 'Face check not completed',
    body: 'This optional check supports account trust and safety.',
    tone: 'neutral',
  },
  pending: {
    title: 'Face check submitted',
    body: 'Your optional face check is being processed.',
    tone: 'warning',
  },
  verified: {
    title: 'Face check completed',
    body: 'The automated face check completed successfully.',
    tone: 'success',
  },
  manual_review: {
    title: 'Admin review needed',
    body: 'An authorized Menorah staff member will review the check result.',
    tone: 'warning',
  },
  rejected: {
    title: 'Face check not approved',
    body: 'Please submit a clear selfie and try again.',
    tone: 'danger',
  },
};

function ImageSlot({ title, subtitle, image, icon: Icon, onPress }: ImageSlotProps) {
  const iosTheme = useIOSTheme();

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.86}
      accessibilityRole="button"
      style={{
        borderWidth: 1,
        borderColor: iosTheme.colors.border,
        borderRadius: iosTheme.radius.xl,
        backgroundColor: iosTheme.colors.surface,
        overflow: 'hidden',
      }}
    >
      {image?.uri ? (
        <Image source={{ uri: image.uri }} style={{ width: '100%', height: 160 }} contentFit="cover" />
      ) : (
        <View
          style={{
            height: 160,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: iosTheme.colors.surfaceAlt,
          }}
        >
          <View
            style={{
              width: 54,
              height: 54,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: iosTheme.colors.surface,
              borderWidth: 1,
              borderColor: iosTheme.colors.border,
            }}
          >
            <Icon size={25} color={iosTheme.colors.primary} strokeWidth={2.2} />
          </View>
        </View>
      )}

      <View style={{ padding: iosTheme.spacing.lg }}>
        <Text style={iosTheme.typography.cardTitle}>{title}</Text>
        <Text style={[iosTheme.typography.caption, { marginTop: iosTheme.spacing.xs }]}>
          {subtitle}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function IdentityVerification({ navigation, route }: any) {
  const iosTheme = useIOSTheme();
  const { user, updateUser } = useAuth();
  const fromSignup = route?.params?.fromSignup === true;
  const [selfie, setSelfie] = useState<ProfileImageUpload | null>(null);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [status, setStatus] = useState<KycStatus>(user?.kyc?.status || 'not_started');
  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);

  const copy = statusCopy[status] || statusCopy.not_started;
  const canContinueFromSignup = fromSignup && ['pending', 'manual_review', 'verified'].includes(status);
  const continueToApp = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'Tabs' }],
    });
  };
  const toneColors = useMemo(() => {
    if (copy.tone === 'success') {
      return { bg: '#dcfce7', fg: '#166534', border: '#bbf7d0', Icon: BadgeCheck };
    }
    if (copy.tone === 'danger') {
      return { bg: '#fee2e2', fg: '#991b1b', border: '#fecaca', Icon: AlertTriangle };
    }
    if (copy.tone === 'warning') {
      return { bg: '#fef3c7', fg: '#92400e', border: '#fde68a', Icon: AlertTriangle };
    }
    return { bg: iosTheme.colors.surfaceAlt, fg: iosTheme.colors.primary, border: iosTheme.colors.border, Icon: ShieldCheck };
  }, [copy.tone, iosTheme.colors.border, iosTheme.colors.primary, iosTheme.colors.surfaceAlt]);

  useEffect(() => {
    let mounted = true;

    api.getKycStatus().then((response) => {
      if (!mounted) return;
      if (response.success && response.data?.status) {
        setStatus(response.data.status);
      }
      setCheckingStatus(false);
    });

    return () => {
      mounted = false;
    };
  }, []);

  const takePhoto = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Camera Permission Required', 'Please allow camera access to continue the optional face check.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.25,
      });

      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      const imageType = asset.mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
      const imageExtension = imageType === 'image/png' ? 'png' : 'jpg';
      const imageName = asset.fileName
        ? asset.fileName.replace(/\.[^.]+$/, `.${imageExtension}`)
        : `selfie-${Date.now()}.${imageExtension}`;
      const image = {
        uri: asset.uri,
        name: imageName,
        type: imageType,
      };

      setSelfie(image);
    } catch (error) {
      reportError('identity.camera_failed', error);
      Alert.alert('Camera Error', 'Unable to open the camera. Please try again.');
    }
  };

  const submit = async () => {
    if (!selfie) {
      Alert.alert('Photo Required', 'Please capture a clear face photo before submitting.');
      return;
    }

    if (!consentAccepted) {
      Alert.alert('Consent Required', 'Please explicitly accept the face-check notice before submitting.');
      return;
    }

    setLoading(true);
    const response = await api.submitKycVerification({
      selfie,
      consentAccepted,
      consentVersion: FACE_CHECK_CONSENT_VERSION,
    });
    setLoading(false);

    if (!response.success || !response.data) {
      const message = response.message || 'The optional face check could not be completed right now. Please try again later or skip for now.';
      reportError('identity.face_check_rejected');
      Alert.alert('Face Check Failed', message);
      return;
    }

    setStatus(response.data.status);
    if (user && response.data.kyc) {
      updateUser({ ...user, kyc: response.data.kyc });
    }

    Alert.alert(
      response.data.status === 'verified' ? 'Face Check Complete' : 'Submitted for Review',
      response.message || 'Optional face check submitted.',
      fromSignup
        ? [{ text: 'Continue', onPress: continueToApp }]
        : undefined
    );
  };

  const StatusIcon = toneColors.Icon;

  return (
    <View style={{ flex: 1, backgroundColor: iosTheme.colors.background }}>
      <IOSHeader
        title="Optional face check"
        subtitle="Account trust and safety"
        showWordmark={false}
        onMenuPress={fromSignup ? continueToApp : () => navigation.goBack()}
        onRightPress={fromSignup ? continueToApp : () => navigation.goBack()}
        rightIcon={fromSignup ? ChevronRight : undefined}
      />

      <IOSScreen edges={['right', 'bottom', 'left']} contentContainerStyle={{ paddingTop: iosTheme.spacing.sm }}>
        {fromSignup ? (
          <IOSCard>
            <Text style={iosTheme.typography.cardTitle}>Optional verification</Text>
            <Text style={[iosTheme.typography.body, { marginTop: iosTheme.spacing.xs }]}>
              Complete the face check now, or skip it and continue to the app.
            </Text>
            <IOSButton
              title="Skip for now"
              variant="ghost"
              onPress={continueToApp}
              style={{ marginTop: iosTheme.spacing.md, minHeight: 44, alignSelf: 'flex-start' }}
            />
          </IOSCard>
        ) : null}

        {fromSignup ? (
          <IOSCard contentStyle={{ flexDirection: 'row', alignItems: 'center', gap: iosTheme.spacing.md }}>
            <Text style={[iosTheme.typography.body, { flex: 1 }]}>
              This is not government-ID verification. You can continue without completing it.
            </Text>
          </IOSCard>
        ) : null}

        <IOSCard
          style={{ borderColor: toneColors.border, backgroundColor: toneColors.bg }}
          contentStyle={{ flexDirection: 'row', alignItems: 'center', gap: iosTheme.spacing.md }}
        >
          <View
            style={{
              width: 46,
              height: 46,
              borderRadius: 17,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(255,255,255,0.65)',
            }}
          >
            <StatusIcon size={23} color={toneColors.fg} strokeWidth={2.4} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: toneColors.fg, fontSize: 16, lineHeight: 21, fontWeight: '900' }}>
              {checkingStatus ? 'Checking status' : copy.title}
            </Text>
            <Text style={{ color: toneColors.fg, fontSize: 13, lineHeight: 18, marginTop: 3 }}>
              {copy.body}
            </Text>
          </View>
        </IOSCard>

        <IOSSectionHeader title="Optional Face Check Notice" />
        <IOSCard>
          {FACE_CHECK_NOTICE_SECTIONS.map((section, index) => (
            <View
              key={section.title}
              style={{
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: iosTheme.colors.border,
                paddingTop: index === 0 ? 0 : iosTheme.spacing.md,
                marginTop: index === 0 ? 0 : iosTheme.spacing.md,
              }}
            >
              <Text style={iosTheme.typography.cardTitle}>{section.title}</Text>
              <Text style={[iosTheme.typography.body, { marginTop: iosTheme.spacing.xs }]}>
                {section.body}
              </Text>
            </View>
          ))}

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: iosTheme.spacing.lg, marginTop: iosTheme.spacing.lg }}>
            <TouchableOpacity
              accessibilityRole="link"
              onPress={() => Linking.openURL(MENORAH_PRIVACY_POLICY_URL)}
            >
              <Text style={{ color: iosTheme.colors.primary, fontWeight: '800' }}>Menorah Privacy Policy</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="link"
              onPress={() => Linking.openURL(LUXAND_PRIVACY_POLICY_URL)}
            >
              <Text style={{ color: iosTheme.colors.primary, fontWeight: '800' }}>Luxand Privacy Policy</Text>
            </TouchableOpacity>
          </View>
          <Text style={[iosTheme.typography.caption, { marginTop: iosTheme.spacing.md }]}>
            Notice version: {FACE_CHECK_CONSENT_VERSION}
          </Text>
        </IOSCard>

        <IOSSectionHeader title="Capture" />
        <View style={{ gap: iosTheme.spacing.md }}>
          <ImageSlot
            title="Face photo"
            subtitle={selfie ? 'Face photo captured' : 'Use the front camera in good light'}
            icon={Camera}
            image={selfie}
            onPress={takePhoto}
          />
        </View>

        <IOSSectionHeader title="Consent" />
        <TouchableOpacity
          onPress={() => setConsentAccepted((value) => !value)}
          activeOpacity={0.82}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: consentAccepted }}
        >
          <IOSCard contentStyle={{ flexDirection: 'row', alignItems: 'center', gap: iosTheme.spacing.md }}>
            {consentAccepted ? (
              <CheckSquare size={23} color={iosTheme.colors.primary} strokeWidth={2.4} />
            ) : (
              <Square size={23} color={iosTheme.colors.textMuted} strokeWidth={2.4} />
            )}
            <Text style={[iosTheme.typography.body, { flex: 1 }]}>
              {FACE_CHECK_CONSENT_TEXT}
            </Text>
          </IOSCard>
        </TouchableOpacity>

        <IOSButton
          title={canContinueFromSignup ? 'Continue' : 'Submit Face Check'}
          onPress={canContinueFromSignup ? continueToApp : submit}
          loading={loading}
          disabled={!canContinueFromSignup && (!selfie || !consentAccepted)}
          iconEnd={ShieldCheck}
          style={{ marginTop: iosTheme.spacing.md }}
        />
      </IOSScreen>
    </View>
  );
}
