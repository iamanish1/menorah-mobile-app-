import { Alert, Text, TouchableOpacity, View } from 'react-native';
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
import { useAuth } from '@/state/useAuth';

type ImageSlotProps = {
  title: string;
  subtitle: string;
  image?: ProfileImageUpload | null;
  icon: typeof Camera;
  onPress: () => void;
};

const statusCopy: Record<KycStatus, { title: string; body: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  not_started: {
    title: 'Identity not verified',
    body: 'Face ID is used for eKYC verification and account safety.',
    tone: 'neutral',
  },
  pending: {
    title: 'Verification submitted',
    body: 'Your identity check is being processed.',
    tone: 'warning',
  },
  verified: {
    title: 'Verified',
    body: 'Your identity verification is complete.',
    tone: 'success',
  },
  manual_review: {
    title: 'Admin review needed',
    body: 'Your images were submitted and an admin will review the result.',
    tone: 'warning',
  },
  rejected: {
    title: 'Verification not approved',
    body: 'Please submit clear images and try again.',
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
        Alert.alert('Camera Permission Required', 'Please allow camera access to continue identity verification.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.4,
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

      if (__DEV__) {
        console.log('[IdentityVerification] Captured selfie:', {
          width: asset.width,
          height: asset.height,
          fileSize: asset.fileSize,
          mimeType: asset.mimeType,
          uploadType: image.type,
          uploadName: image.name,
        });
      }

      setSelfie(image);
    } catch (error) {
      console.error('[IdentityVerification] Camera error:', error);
      Alert.alert('Camera Error', 'Unable to open the camera. Please try again.');
    }
  };

  const submit = async () => {
    if (!selfie) {
      Alert.alert('Photo Required', 'Please capture a clear face photo before submitting.');
      return;
    }

    if (!consentAccepted) {
      Alert.alert('Consent Required', 'Please confirm consent before submitting identity verification.');
      return;
    }

    setLoading(true);
    const response = await api.submitKycVerification({
      selfie,
      consentAccepted,
    });
    setLoading(false);

    if (!response.success || !response.data) {
      const message = response.message || 'Identity verification could not be completed right now. Please try again later or skip for now.';
      if (__DEV__) {
        console.error('[IdentityVerification] Submit failed:', response);
      }
      Alert.alert('Verification Failed', message);
      return;
    }

    setStatus(response.data.status);
    if (user && response.data.kyc) {
      updateUser({ ...user, kyc: response.data.kyc });
    }

    Alert.alert(
      response.data.status === 'verified' ? 'Verified' : 'Submitted for Review',
      response.message || 'Identity verification submitted.',
      fromSignup
        ? [{ text: 'Continue', onPress: continueToApp }]
        : undefined
    );
  };

  const StatusIcon = toneColors.Icon;

  return (
    <View style={{ flex: 1, backgroundColor: iosTheme.colors.background }}>
      <IOSHeader
        title={fromSignup ? 'Verify identity' : 'Identity'}
        subtitle={fromSignup ? 'Optional account trust step' : 'eKYC verification'}
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
              Verify now to build account trust, or skip and do it later from Profile.
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
              You can continue without eKYC. Some trust features may ask you to complete it later.
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
              Face ID is used for eKYC verification and account safety. This helps us verify your identity and improve community trust. The photo is processed for this check and is not stored by Menorah.
            </Text>
          </IOSCard>
        </TouchableOpacity>

        <IOSButton
          title={canContinueFromSignup ? 'Continue' : 'Submit Verification'}
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
