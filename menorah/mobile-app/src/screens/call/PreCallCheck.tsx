import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ActivityIndicator, Alert, ScrollView, Platform, PermissionsAndroid } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Wifi, CheckCircle, XCircle, Video, Mic, Clock } from 'lucide-react-native';
import Button from '@/components/ui/Button';
import { useThemeMode } from '@/theme/ThemeProvider';
import { palettes } from '@/theme/colors';
import { api } from '@/lib/api';
import NetInfo from '@react-native-community/netinfo';

export default function PreCallCheck({ navigation, route }: any) {
  const { bookingId } = route.params || {};
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [networkOk, setNetworkOk] = useState(false);
  const [micPermission, setMicPermission] = useState<boolean | null>(null);
  const [cameraPermission, setCameraPermission] = useState<boolean | null>(null);
  const [waitingForCounsellor, setWaitingForCounsellor] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];

  useEffect(() => {
    checkNetwork();
    requestPermissions();
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [bookingId]);

  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      try {
        const permissions = [
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          PermissionsAndroid.PERMISSIONS.CAMERA,
        ];
        
        const granted = await PermissionsAndroid.requestMultiple(permissions);
        
        setMicPermission(granted[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === PermissionsAndroid.RESULTS.GRANTED);
        setCameraPermission(granted[PermissionsAndroid.PERMISSIONS.CAMERA] === PermissionsAndroid.RESULTS.GRANTED);
        
        if (
          granted[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] !== PermissionsAndroid.RESULTS.GRANTED ||
          granted[PermissionsAndroid.PERMISSIONS.CAMERA] !== PermissionsAndroid.RESULTS.GRANTED
        ) {
          Alert.alert(
            'Permissions Required',
            'Microphone and camera permissions are required for video calls. Please enable them in app settings.',
            [{ text: 'OK' }]
          );
        }
      } catch (err) {
        console.error('Permission request error:', err);
        setMicPermission(false);
        setCameraPermission(false);
      }
    } else {
      // iOS permissions are handled automatically
      setMicPermission(true);
      setCameraPermission(true);
    }
  };

  const checkNetwork = async () => {
    try {
      const state = await NetInfo.fetch();
      setNetworkOk(state.isConnected && (state.type === 'wifi' || state.type === 'cellular'));
    } catch (error) {
      console.error('Network check error:', error);
      setNetworkOk(false);
    } finally {
      setChecking(false);
    }
  };


  const attemptJoin = async (): Promise<boolean> => {
    try {
      const joinResponse = await api.joinVideoRoom(bookingId);
      if (joinResponse.success && joinResponse.data) {
        navigation.navigate('CallJoin', {
          bookingId,
          roomId: joinResponse.data.roomId,
          roomUrl: joinResponse.data.roomUrl,
          jitsiToken: joinResponse.data.jitsiToken,
          sessionType: joinResponse.data.sessionType,
          counsellorName: joinResponse.data.counsellorName,
          userName: joinResponse.data.userName,
        });
        return true;
      }
      const msg: string = (joinResponse as any).message || '';
      if (msg.toLowerCase().includes('not been started') || msg.toLowerCase().includes('not active')) {
        return false; // counsellor not started yet — keep waiting
      }
      Alert.alert('Error', msg || 'Failed to join session. Please try again.');
      return true; // stop polling on unexpected errors
    } catch (error: any) {
      const msg: string = error.response?.data?.message || error.message || '';
      if (msg.toLowerCase().includes('not been started') || msg.toLowerCase().includes('not active')) {
        return false;
      }
      Alert.alert('Error', msg || 'Failed to join session. Please try again.');
      return true;
    }
  };

  const schedulePoll = () => {
    pollTimerRef.current = setTimeout(async () => {
      const done = await attemptJoin();
      if (!done) schedulePoll(); // keep retrying every 5s
    }, 5000);
  };

  const handleJoinSession = async () => {
    if (!networkOk) {
      Alert.alert('Network Error', 'Please check your internet connection and try again.');
      return;
    }
    if (!bookingId) {
      Alert.alert('Error', 'Booking ID is missing. Please try again.');
      return;
    }

    setLoading(true);
    const done = await attemptJoin();
    setLoading(false);

    if (!done) {
      // Counsellor hasn't started yet — show waiting state and poll
      setWaitingForCounsellor(true);
      schedulePoll();
    }
  };

  if (waitingForCounsellor) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Clock size={56} color={colors.primary} />
          <Text style={{ fontSize: 22, fontWeight: '700', color: colors.text, marginTop: 24, marginBottom: 12, textAlign: 'center' }}>
            Waiting for Counsellor
          </Text>
          <Text style={{ fontSize: 15, color: colors.muted, textAlign: 'center', marginBottom: 32 }}>
            Your counsellor hasn't started the session yet. You'll be connected automatically once they begin.
          </Text>
          <ActivityIndicator size="large" color={colors.primary} />
          <Button
            title="Cancel"
            onPress={() => {
              if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
              navigation.goBack();
            }}
            style={{ marginTop: 32, backgroundColor: colors.border }}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, justifyContent: 'center' }}>
        <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text, marginBottom: 24, textAlign: 'center' }}>
          Quick Device Check
        </Text>
        
        <View style={{
          backgroundColor: colors.card,
          borderRadius: 20,
          padding: 20,
          marginBottom: 16,
          borderWidth: 1,
          borderColor: colors.border
        }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Wifi size={20} color={colors.primary} style={{ marginRight: 12 }} />
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>
                Network
              </Text>
            </View>
            {checking ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : networkOk ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <CheckCircle size={20} color="#10B981" />
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#10B981', marginLeft: 8 }}>
                  OK
                </Text>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <XCircle size={20} color="#EF4444" />
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#EF4444', marginLeft: 8 }}>
                  Check Connection
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={{
          backgroundColor: colors.card,
          borderRadius: 20,
          padding: 20,
          marginBottom: 16,
          borderWidth: 1,
          borderColor: colors.border
        }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Video size={20} color={colors.primary} style={{ marginRight: 12 }} />
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>
                Camera
              </Text>
            </View>
            {cameraPermission === null ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : cameraPermission ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <CheckCircle size={20} color="#10B981" />
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#10B981', marginLeft: 8 }}>
                  Ready
                </Text>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <XCircle size={20} color="#EF4444" />
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#EF4444', marginLeft: 8 }}>
                  Permission Needed
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={{
          backgroundColor: colors.card,
          borderRadius: 20,
          padding: 20,
          marginBottom: 24,
          borderWidth: 1,
          borderColor: colors.border
        }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Mic size={20} color={colors.primary} style={{ marginRight: 12 }} />
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>
                Microphone
              </Text>
            </View>
            {micPermission === null ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : micPermission ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <CheckCircle size={20} color="#10B981" />
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#10B981', marginLeft: 8 }}>
                  Ready
                </Text>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <XCircle size={20} color="#EF4444" />
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#EF4444', marginLeft: 8 }}>
                  Permission Needed
                </Text>
              </View>
            )}
          </View>
        </View>

        <Button
          title="Join Session"
          onPress={handleJoinSession}
          disabled={!networkOk || loading || micPermission === false || cameraPermission === false}
          style={{ marginTop: 20 }}
          loading={loading}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
