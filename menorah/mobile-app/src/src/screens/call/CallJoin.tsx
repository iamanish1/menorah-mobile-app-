import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, Platform, PermissionsAndroid } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { X, PhoneOff } from 'lucide-react-native';
import { useThemeMode } from '@/theme/ThemeProvider';
import { palettes } from '@/theme/colors';
import { ENV } from '@/lib/env';
import { api } from '@/lib/api';

export default function CallJoin({ navigation, route }: any) {
  const { roomId, roomUrl, jitsiToken, bookingId, sessionType, counsellorName, userName } = route.params || {};
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const webViewRef = useRef<WebView>(null);

  useEffect(() => {
    if (!roomId) {
      setError('Missing video room information');
      setLoading(false);
    } else {
      // Request permissions before loading WebView
      requestPermissions();
    }
  }, [roomId]);

  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      try {
        // Check if permissions are already granted
        const audioCheck = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
        const cameraCheck = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
        
        if (audioCheck && cameraCheck) {
          console.log('Permissions already granted');
          setPermissionsGranted(true);
          return;
        }

        // Request permissions
        const permissions = [
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          PermissionsAndroid.PERMISSIONS.CAMERA,
        ];
        
        const granted = await PermissionsAndroid.requestMultiple(permissions);
        
        const audioGranted = granted[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === PermissionsAndroid.RESULTS.GRANTED;
        const cameraGranted = granted[PermissionsAndroid.PERMISSIONS.CAMERA] === PermissionsAndroid.RESULTS.GRANTED;
        
        if (audioGranted && cameraGranted) {
          console.log('Microphone and camera permissions granted');
          setPermissionsGranted(true);
        } else {
          const missingPermissions: string[] = [];
          if (!audioGranted) missingPermissions.push('Microphone');
          if (!cameraGranted) missingPermissions.push('Camera');
          
          Alert.alert(
            'Permissions Required',
            `${missingPermissions.join(' and ')} permission${missingPermissions.length > 1 ? 's are' : ' is'} required for video calls. Please enable ${missingPermissions.length > 1 ? 'them' : 'it'} in app settings.`,
            [
              { text: 'Cancel', style: 'cancel', onPress: () => navigation.goBack() },
              { 
                text: 'Open Settings', 
                onPress: () => {
                  // On Android, we can't directly open app settings, but we can show instructions
                  Alert.alert(
                    'Enable Permissions',
                    'Go to: Settings → Apps → Menorah Health → Permissions → Enable Microphone and Camera',
                    [{ text: 'OK' }]
                  );
                }
              }
            ]
          );
          setPermissionsGranted(false);
        }
      } catch (err) {
        console.error('Permission request error:', err);
        Alert.alert(
          'Permission Error',
          'Failed to request permissions. Please enable microphone and camera in app settings.',
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
        setPermissionsGranted(false);
      }
    } else {
      // iOS - permissions are handled automatically
      setPermissionsGranted(true);
    }
  };

  const handleLeave = async () => {
    Alert.alert(
      'Leave Session',
      'Are you sure you want to leave the session?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              if (bookingId) {
                await api.leaveVideoRoom(bookingId);
              }
              navigation.goBack();
            } catch (error: any) {
              console.error('Error leaving video room:', error);
              navigation.goBack();
            }
          }
        }
      ]
    );
  };

  const handleWebViewError = (syntheticEvent: any) => {
    const { nativeEvent } = syntheticEvent;
    console.error('WebView error:', nativeEvent);
    setError('Failed to load video session');
    setLoading(false);
  };

  const handleWebViewLoad = () => {
    setLoading(false);
  };

  if (error) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text, marginBottom: 12 }}>
            Error Loading Session
          </Text>
          <Text style={{ fontSize: 14, color: colors.muted, textAlign: 'center', marginBottom: 24 }}>
            {error}
          </Text>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{
              backgroundColor: colors.primary,
              paddingHorizontal: 24,
              paddingVertical: 12,
              borderRadius: 12
            }}
          >
            <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>
              Go Back
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Build Jitsi URL with audio enabled by default
  // Add config parameters to ensure microphone is enabled
  const jitsiConfigParams = new URLSearchParams({
    'config.startWithAudioMuted': 'false',
    'config.startWithVideoMuted': 'false',
    'config.enableLayerSuspension': 'true',
    'config.enableNoAudioDetection': 'true',
    'config.enableNoisyMicDetection': 'true',
    'interfaceConfig.SHOW_JITSI_WATERMARK': 'false',
    'interfaceConfig.SHOW_WATERMARK_FOR_GUESTS': 'false'
  }).toString();
  
  // Build hash fragment with JWT token and config
  const hashParams: string[] = [];
  if (jitsiToken) {
    hashParams.push(`jwt=${jitsiToken}`);
  }
  hashParams.push(jitsiConfigParams);
  const hashFragment = hashParams.length > 0 ? `#${hashParams.join('&')}` : '';
  
  const jitsiUrl = roomUrl 
    ? `${roomUrl}${hashFragment}`
    : `${ENV.JITSI_BASE_URL}/${roomId}${hashFragment}`;

  // Inject JavaScript to ensure microphone permissions are handled
  const injectedJavaScript = `
    (function() {
      // Request microphone and camera permissions when page loads
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ audio: true, video: true })
          .then(function(stream) {
            console.log('Microphone and camera access granted');
            // Stop the stream immediately - we just needed permission
            stream.getTracks().forEach(track => track.stop());
          })
          .catch(function(error) {
            console.error('Permission error:', error);
            // Try to show a user-friendly message
            if (window.JitsiMeetJS) {
              console.log('Jitsi Meet JS is available');
            }
          });
      }
      
      // Override console.log to help with debugging
      const originalLog = console.log;
      console.log = function(...args) {
        originalLog.apply(console, args);
        // Send logs to React Native if needed
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'log',
            message: args.join(' ')
          }));
        }
      };
    })();
    true; // Required for injected JavaScript
  `;

  // Don't render WebView until permissions are granted
  if (!permissionsGranted && Platform.OS === 'android') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, marginTop: 16, textAlign: 'center' }}>
            Requesting permissions...
          </Text>
          <Text style={{ fontSize: 14, color: colors.muted, marginTop: 8, textAlign: 'center' }}>
            Please grant microphone and camera permissions to continue
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header Controls */}
      <View style={{
        backgroundColor: colors.card,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border
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
            gap: 8
          }}
        >
          <PhoneOff size={16} color="white" />
          <Text style={{ color: 'white', fontSize: 14, fontWeight: '600' }}>
            Leave
          </Text>
        </TouchableOpacity>
      </View>

      {/* WebView Container */}
      <View style={{ flex: 1 }}>
        {loading && (
          <View style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: colors.bg,
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1
          }}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ fontSize: 14, color: colors.muted, marginTop: 12 }}>
              Loading video session...
            </Text>
          </View>
        )}
        
        <WebView
          source={{ uri: jitsiUrl }}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          allowsProtectedMedia={true}
          onError={handleWebViewError}
          onLoad={handleWebViewLoad}
          style={{ flex: 1 }}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={true}
          androidHardwareAccelerationDisabled={false}
          androidLayerType="hardware"
          ref={webViewRef}
          injectedJavaScript={injectedJavaScript}
          onPermissionRequest={(request) => {
            // Grant microphone and camera permissions for WebView
            const { nativeEvent } = request;
            console.log('WebView permission request:', nativeEvent.permission);
            
            // Grant all audio and video capture permissions
            if (nativeEvent.permission === 'android.webkit.resource.AUDIO_CAPTURE' ||
                nativeEvent.permission === 'android.webkit.resource.VIDEO_CAPTURE') {
              console.log('Granting permission:', nativeEvent.permission);
              nativeEvent.request.grant(nativeEvent.resources);
            } else {
              console.log('Denying permission:', nativeEvent.permission);
              nativeEvent.request.deny();
            }
          }}
          onHttpError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.error('WebView HTTP error:', nativeEvent);
          }}
          onMessage={(event) => {
            // Handle messages from Jitsi if needed
            try {
              const data = JSON.parse(event.nativeEvent.data);
              if (data.type === 'log') {
                console.log('Jitsi log:', data.message);
              }
            } catch (e) {
              console.log('WebView message:', event.nativeEvent.data);
            }
          }}
          onShouldStartLoadWithRequest={(request) => {
            // Allow all navigation
            return true;
          }}
          renderLoading={() => (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg }}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          )}
        />
      </View>
    </SafeAreaView>
  );
}
