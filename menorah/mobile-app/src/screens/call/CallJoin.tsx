import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  Alert, Platform, PermissionsAndroid,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { PhoneOff } from 'lucide-react-native';
import { useThemeMode } from '@/theme/ThemeProvider';
import { palettes } from '@/theme/colors';
import { ENV } from '@/lib/env';
import { api } from '@/lib/api';

interface RouteParams {
  bookingId:     string;
  roomId:        string;
  livekitUrl:    string;   // wss://livekit.menorahhealth.app
  livekitToken:  string;   // LiveKit JWT participant token
  sessionType:   'video' | 'audio' | 'chat';
  counsellorName: string;
  userName:      string;
}

export default function CallJoin({ navigation, route }: any) {
  const {
    bookingId,
    roomId,
    livekitUrl,
    livekitToken,
    sessionType,
    counsellorName,
    userName,
  } = (route.params || {}) as RouteParams;

  const [loading,            setLoading]            = useState(true);
  const [error,              setError]              = useState<string | null>(null);
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const webViewRef = useRef<WebView>(null);
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];

  useEffect(() => {
    if (!livekitToken || !livekitUrl) {
      setError('Missing video session information. Please try again.');
      setLoading(false);
    } else {
      requestPermissions();
    }
  }, [livekitToken, livekitUrl]);

  // ── Android permission request ───────────────────────────────────────────
  const requestPermissions = async () => {
    if (Platform.OS !== 'android') {
      setPermissionsGranted(true);
      return;
    }
    try {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        PermissionsAndroid.PERMISSIONS.CAMERA,
      ]);

      const audioOk  = granted[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO]  === PermissionsAndroid.RESULTS.GRANTED;
      const cameraOk = granted[PermissionsAndroid.PERMISSIONS.CAMERA]         === PermissionsAndroid.RESULTS.GRANTED;

      if (audioOk && cameraOk) {
        setPermissionsGranted(true);
      } else {
        const missing = [...(!audioOk ? ['Microphone'] : []), ...(!cameraOk ? ['Camera'] : [])];
        Alert.alert(
          'Permissions Required',
          `${missing.join(' and ')} permission${missing.length > 1 ? 's are' : ' is'} required for video calls.`,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => navigation.goBack() },
            {
              text: 'Open Settings',
              onPress: () => Alert.alert(
                'Enable Permissions',
                'Go to: Settings → Apps → Menorah Health → Permissions → Enable Microphone and Camera',
                [{ text: 'OK' }]
              ),
            },
          ]
        );
        setPermissionsGranted(false);
      }
    } catch {
      Alert.alert('Permission Error', 'Failed to request permissions. Please enable them in app settings.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
      setPermissionsGranted(false);
    }
  };

  // ── Leave handler ────────────────────────────────────────────────────────
  const handleLeave = () => {
    Alert.alert('Leave Session', 'Are you sure you want to leave the session?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          try {
            if (bookingId) await api.leaveVideoRoom(bookingId);
          } catch {
            // Always navigate back regardless of API error
          } finally {
            navigation.goBack();
          }
        },
      },
    ]);
  };

  // ── Messages from the WebView (LiveKit meet page) ─────────────────────────
  const handleWebViewMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.action === 'leave' || data.action === 'session_ended') {
        // User left via in-page button — call leave API then go back
        api.leaveVideoRoom(bookingId).catch(() => {}).finally(() => navigation.goBack());
      }
    } catch {
      // Non-JSON message — ignore
    }
  };

  // ── Error screen ─────────────────────────────────────────────────────────
  if (error) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text, marginBottom: 12 }}>
            Session Error
          </Text>
          <Text style={{ fontSize: 14, color: colors.muted, textAlign: 'center', marginBottom: 24 }}>
            {error}
          </Text>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{ backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}
          >
            <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Waiting for Android permission dialog
  if (!permissionsGranted && Platform.OS === 'android') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, marginTop: 16, textAlign: 'center' }}>
            Requesting permissions…
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Build the meet URL served by the backend
  // The backend's GET /api/video/meet renders an HTML page with the LiveKit JS SDK.
  const apiBase  = (ENV.API_BASE_URL || 'http://localhost:3000/api').replace(/\/api\/?$/, '');
  const meetUrl  = `${apiBase}/api/video/meet`
    + `?token=${encodeURIComponent(livekitToken)}`
    + `&url=${encodeURIComponent(livekitUrl)}`
    + `&name=${encodeURIComponent(userName || 'Participant')}`
    + `&type=${sessionType === 'video' ? 'video' : 'audio'}`;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header */}
      <View style={{
        backgroundColor: colors.card,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }} numberOfLines={1}>
            {sessionType === 'video' ? 'Video Session' : 'Audio Session'}
          </Text>
          <Text style={{ fontSize: 12, color: colors.muted }} numberOfLines={1}>
            {counsellorName || 'Counsellor'}
          </Text>
        </View>
        <TouchableOpacity
          onPress={handleLeave}
          style={{
            backgroundColor: '#EF4444',
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <PhoneOff size={16} color="white" />
          <Text style={{ color: 'white', fontSize: 14, fontWeight: '600' }}>Leave</Text>
        </TouchableOpacity>
      </View>

      {/* LiveKit meet page */}
      <View style={{ flex: 1 }}>
        {loading && (
          <View style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: colors.bg,
            justifyContent: 'center', alignItems: 'center', zIndex: 1,
          }}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ fontSize: 14, color: colors.muted, marginTop: 12 }}>
              Connecting to session…
            </Text>
          </View>
        )}

        <WebView
          ref={webViewRef}
          source={{ uri: meetUrl }}
          onLoad={() => setLoading(false)}
          onError={() => { setError('Failed to load video session. Please check your connection.'); setLoading(false); }}
          onMessage={handleWebViewMessage}
          // Media permissions
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          allowsProtectedMedia={true}
          // Performance
          androidHardwareAccelerationDisabled={false}
          androidLayerType="hardware"
          javaScriptEnabled={true}
          domStorageEnabled={true}
          style={{ flex: 1 }}
          onPermissionRequest={(request) => {
            const { nativeEvent } = request;
            // Grant mic and camera for WebRTC
            if (
              nativeEvent.permission === 'android.webkit.resource.AUDIO_CAPTURE' ||
              nativeEvent.permission === 'android.webkit.resource.VIDEO_CAPTURE'
            ) {
              nativeEvent.request.grant(nativeEvent.resources);
            } else {
              nativeEvent.request.deny();
            }
          }}
        />
      </View>
    </SafeAreaView>
  );
}
