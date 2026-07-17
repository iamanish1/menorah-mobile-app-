import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  Alert, Platform, PermissionsAndroid, StyleSheet, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { api } from '@/lib/api';

const WebViewWithPermissions = WebView as any;

interface RouteParams {
  bookingId:      string;
  roomId:         string;
  livekitUrl:     string;
  livekitToken:   string;
  meetUrl?:       string;
  provider?:      string;
  joinMode?:      string;
  joinUrl?:       string;
  externalJoinUrl?: string;
  sessionType:    'video' | 'audio' | 'chat';
  counsellorName: string;
  userName:       string;
}

export default function CallJoin({ navigation, route }: any) {
  const {
    bookingId,
    livekitUrl,
    meetUrl,
    provider,
    joinMode,
    joinUrl,
    externalJoinUrl,
    counsellorName,
  } = (route.params || {}) as RouteParams;

  const [loading,            setLoading]            = useState(true);
  const [error,              setError]              = useState<string | null>(null);
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const webViewRef = useRef<WebView>(null);

  const requestPermissions = useCallback(async () => {
    if (Platform.OS !== 'android') {
      setPermissionsGranted(true);
      return;
    }
    try {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        PermissionsAndroid.PERMISSIONS.CAMERA,
      ]);
      const audioOk  = granted[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === PermissionsAndroid.RESULTS.GRANTED;
      const cameraOk = granted[PermissionsAndroid.PERMISSIONS.CAMERA]        === PermissionsAndroid.RESULTS.GRANTED;

      if (audioOk && cameraOk) {
        setPermissionsGranted(true);
      } else {
        const missing = [...(!audioOk ? ['Microphone'] : []), ...(!cameraOk ? ['Camera'] : [])];
        Alert.alert(
          'Permissions Required',
          `${missing.join(' and ')} permission${missing.length > 1 ? 's are' : ' is'} required for this session.`,
          [
            { text: 'Go Back', style: 'cancel', onPress: () => navigation.goBack() },
            {
              text: 'Open Settings',
              onPress: () => Alert.alert(
                'Enable in Settings',
                'Settings -> Apps -> Menorah Health -> Permissions -> Enable Camera & Microphone',
                [{ text: 'OK' }]
              ),
            },
          ]
        );
        setPermissionsGranted(false);
      }
    } catch (permissionError) {
      console.warn('Could not request call permissions:', permissionError);
      Alert.alert('Permission Error', 'Could not request permissions. Please enable them in app settings.', [
        { text: 'Go Back', onPress: () => navigation.goBack() },
      ]);
      setPermissionsGranted(false);
    }
  }, [navigation]);

  useEffect(() => {
    if (joinMode === 'external_link') {
      const externalUrl = joinUrl || externalJoinUrl;
      if (externalUrl) {
        Linking.openURL(externalUrl).catch(() => setError('Could not open the external session link.'));
      } else {
        setError('External session link is not configured yet.');
      }
      setLoading(false);
      return;
    }
    if (joinMode === 'disabled' || provider === 'disabled') {
      setError('Video calling is not available until your region is verified.');
      setLoading(false);
      return;
    }
    if (!meetUrl || !livekitUrl) {
      setError('Missing session information. Please go back and try again.');
      setLoading(false);
    } else {
      requestPermissions();
    }
  }, [provider, joinMode, joinUrl, externalJoinUrl, meetUrl, livekitUrl, requestPermissions]);

  const handleLeave = () => {
    Alert.alert(
      'Leave Session',
      'Are you sure you want to leave the session?',
      [
        { text: 'Stay', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              if (bookingId) await api.leaveVideoRoom(bookingId);
            } catch (leaveError) {
              console.warn('Failed to leave video room:', leaveError);
            }
            navigation.goBack();
          },
        },
      ]
    );
  };

  const handleWebViewMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.action === 'leave' || data.action === 'session_ended') {
        api.leaveVideoRoom(bookingId).catch(() => {}).finally(() => navigation.goBack());
      }
    } catch (parseError) {
      console.warn('Ignoring invalid call WebView message:', parseError);
    }
  };

  // ── Error screen ─────────────────────────────────────────────────────────

  if (error) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: '#0a0f1e' }]}>
        <View style={styles.errorIcon}>
          <Text style={{ fontSize: 40 }}>📵</Text>
        </View>
        <Text style={styles.errorTitle}>Session Error</Text>
        <Text style={styles.errorMsg}>{error}</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.errorBtn}>
          <Text style={styles.errorBtnText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── Waiting for permissions ───────────────────────────────────────────────

  if (!permissionsGranted && Platform.OS === 'android') {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: '#0a0f1e' }]}>
        <ActivityIndicator size="large" color="#3d9470" />
        <Text style={styles.permText}>Requesting permissions…</Text>
      </SafeAreaView>
    );
  }

  // ── Build meet URL ───────────────────────────────────────────────────────
  const sessionMeetUrl = meetUrl;

  // ── Full-screen call view ─────────────────────────────────────────────────

  return (
    <View style={styles.fullScreen}>
      {/* Loading overlay — shown until WebView finishes loading */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingAvatarCircle}>
            <Text style={styles.loadingAvatarText}>
              {(counsellorName || 'C').charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.loadingTitle}>
            {counsellorName ? `Session with ${counsellorName}` : 'Joining session…'}
          </Text>
          <ActivityIndicator color="#3d9470" size="small" style={{ marginTop: 16 }} />
          <Text style={styles.loadingSubtitle}>Setting up your connection</Text>

          {/* Emergency leave during load */}
          <TouchableOpacity onPress={handleLeave} style={styles.loadingLeaveBtn}>
            <Text style={styles.loadingLeaveBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      <WebViewWithPermissions
        ref={webViewRef}
        source={{ uri: sessionMeetUrl }}
        onLoad={() => setLoading(false)}
        onError={() => {
          setError('Failed to load video session. Please check your connection and try again.');
          setLoading(false);
        }}
        onMessage={handleWebViewMessage}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        allowsProtectedMedia={true}
        androidLayerType="hardware"
        javaScriptEnabled={true}
        domStorageEnabled={true}
        style={styles.webView}
        onPermissionRequest={(request: any) => {
          const { nativeEvent } = request;
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
  );
}

const styles = StyleSheet.create({
  fullScreen: { flex: 1, backgroundColor: '#0a0f1e' },
  webView:    { flex: 1 },

  // Loading overlay
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#0a0f1e',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    padding: 32,
  },
  loadingAvatarCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#2d7a5c',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: '#3d9470',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
  },
  loadingAvatarText: { color: '#fff', fontSize: 34, fontWeight: '700' },
  loadingTitle:      { color: '#fff', fontSize: 18, fontWeight: '600', textAlign: 'center' },
  loadingSubtitle:   { color: 'rgba(255,255,255,0.45)', fontSize: 13, marginTop: 8 },
  loadingLeaveBtn:   { marginTop: 40, paddingVertical: 12, paddingHorizontal: 28 },
  loadingLeaveBtnText:{ color: 'rgba(255,255,255,0.4)', fontSize: 14, fontWeight: '500' },

  // Error
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  errorIcon: { marginBottom: 16 },
  errorTitle: { color: '#f87171', fontSize: 20, fontWeight: '700', marginBottom: 10 },
  errorMsg:   {
    color: 'rgba(255,255,255,0.5)', fontSize: 14,
    textAlign: 'center', lineHeight: 22, marginBottom: 28,
  },
  errorBtn: {
    backgroundColor: '#2d7a5c',
    paddingVertical: 14, paddingHorizontal: 32,
    borderRadius: 16,
  },
  errorBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Permissions loading
  permText: { color: 'rgba(255,255,255,0.6)', fontSize: 15, marginTop: 16 },
});
