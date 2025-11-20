import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
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
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];

  useEffect(() => {
    if (!roomId || !jitsiToken) {
      setError('Missing video room information');
      setLoading(false);
    }
  }, [roomId, jitsiToken]);

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

  // Build Jitsi URL
  const jitsiUrl = roomUrl || `${ENV.JITSI_BASE_URL}/${roomId}${jitsiToken ? `#jwt=${jitsiToken}` : ''}`;

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
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          onError={handleWebViewError}
          onLoad={handleWebViewLoad}
          style={{ flex: 1 }}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={true}
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
