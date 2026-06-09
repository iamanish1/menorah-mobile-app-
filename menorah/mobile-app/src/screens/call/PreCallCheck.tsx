import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  Alert, ScrollView, Platform, PermissionsAndroid, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Wifi, CheckCircle, XCircle, Video, Mic, Clock, PhoneCall } from 'lucide-react-native';
import { useThemeMode } from '@/theme/ThemeProvider';
import { palettes } from '@/theme/colors';
import { api } from '@/lib/api';
import { socketService } from '@/lib/socket';
import NetInfo from '@react-native-community/netinfo';

type Palette = (typeof palettes)[keyof typeof palettes];

export default function PreCallCheck({ navigation, route }: any) {
  const { bookingId } = route.params || {};
  const { scheme } = useThemeMode();
  const C = palettes[scheme];

  const [loading,              setLoading]              = useState(false);
  const [checking,             setChecking]             = useState(true);
  const [networkOk,            setNetworkOk]            = useState(false);
  const [micPermission,        setMicPermission]        = useState<boolean | null>(null);
  const [cameraPermission,     setCameraPermission]     = useState<boolean | null>(null);
  const [waitingForCounsellor, setWaitingForCounsellor] = useState(false);
  const [counsellorName,       setCounsellorName]       = useState('');
  const [sessionDuration,      setSessionDuration]      = useState(0);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    checkNetwork();
    requestPermissions();
    fetchBookingInfo();
    return () => { if (pollTimerRef.current) clearTimeout(pollTimerRef.current); };
  }, [bookingId]);

  // Auto-join when counsellor starts the session via socket
  useEffect(() => {
    if (!bookingId) return;
    const unsub = socketService.onSessionStarted((data) => {
      if (data.bookingId !== bookingId) return;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      attemptJoin();
    });
    return () => unsub();
  }, [bookingId]);

  const fetchBookingInfo = async () => {
    try {
      const res = await api.getBooking(bookingId);
      if (res.success && res.data?.booking) {
        const b = res.data.booking;
        setCounsellorName(b.counsellorName || '');
        setSessionDuration(b.sessionDuration || 0);
      }
    } catch {}
  };

  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          PermissionsAndroid.PERMISSIONS.CAMERA,
        ]);
        const micOk    = granted[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO]  === PermissionsAndroid.RESULTS.GRANTED;
        const cameraOk = granted[PermissionsAndroid.PERMISSIONS.CAMERA]        === PermissionsAndroid.RESULTS.GRANTED;
        setMicPermission(micOk);
        setCameraPermission(cameraOk);
        if (!micOk || !cameraOk) {
          Alert.alert(
            'Permissions Required',
            'Microphone and camera are required for video sessions. Please enable them in app settings.',
            [{ text: 'OK' }]
          );
        }
      } catch {
        setMicPermission(false);
        setCameraPermission(false);
      }
    } else {
      setMicPermission(true);
      setCameraPermission(true);
    }
  };

  const checkNetwork = async () => {
    try {
      const state = await NetInfo.fetch();
      setNetworkOk(Boolean(state.isConnected && (state.type === 'wifi' || state.type === 'cellular')));
    } catch {
      setNetworkOk(false);
    } finally {
      setChecking(false);
    }
  };

  const attemptJoin = async (): Promise<boolean> => {
    try {
      const res = await api.joinVideoRoom(bookingId);
      if (res.success && res.data) {
        navigation.navigate('CallJoin', {
          bookingId,
          roomId:         res.data.roomId,
          livekitUrl:     res.data.livekitUrl,
          livekitToken:   res.data.livekitToken,
          sessionType:    res.data.sessionType,
          counsellorName: res.data.counsellorName,
          userName:       res.data.userName,
        });
        return true;
      }
      const msg: string = (res as any).message || '';
      if (msg.toLowerCase().includes('not been started') || msg.toLowerCase().includes('not active')) {
        return false;
      }
      Alert.alert('Cannot Join', msg || 'Failed to join session. Please try again.');
      return true;
    } catch (err: any) {
      const msg: string = err.response?.data?.message || err.message || '';
      if (msg.toLowerCase().includes('not been started') || msg.toLowerCase().includes('not active')) {
        return false;
      }
      Alert.alert('Cannot Join', msg || 'Failed to join session. Please try again.');
      return true;
    }
  };

  const schedulePoll = () => {
    pollTimerRef.current = setTimeout(async () => {
      const done = await attemptJoin();
      if (!done) schedulePoll();
    }, 5000);
  };

  const handleJoinSession = async () => {
    if (!networkOk) {
      Alert.alert('No Connection', 'Please check your internet connection and try again.');
      return;
    }
    if (!bookingId) {
      Alert.alert('Error', 'Booking ID is missing. Please go back and try again.');
      return;
    }
    setLoading(true);
    const done = await attemptJoin();
    setLoading(false);
    if (!done) {
      setWaitingForCounsellor(true);
      schedulePoll();
    }
  };

  const allReady = networkOk && micPermission === true && cameraPermission === true;
  const initial  = counsellorName.charAt(0).toUpperCase() || '?';

  // ── Waiting room ─────────────────────────────────────────────────────────

  if (waitingForCounsellor) {
    return (
      <SafeAreaView style={[styles.flex, { backgroundColor: '#0a0f1e' }]}>
        <View style={styles.waitingContainer}>
          {/* Avatar */}
          <View style={styles.waitingAvatar}>
            <Text style={styles.waitingAvatarText}>{initial}</Text>
          </View>

          {/* Name */}
          <Text style={styles.waitingName}>{counsellorName || 'Your Counsellor'}</Text>
          {!!sessionDuration && (
            <Text style={styles.waitingDuration}>{sessionDuration} min session</Text>
          )}

          {/* Status card */}
          <View style={styles.waitingCard}>
            <ActivityIndicator size="small" color="#3d9470" style={{ marginBottom: 12 }} />
            <Text style={styles.waitingCardTitle}>Waiting for counsellor to start</Text>
            <Text style={styles.waitingCardSub}>
              You'll be connected automatically once your counsellor begins the session.
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => {
              if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
              navigation.goBack();
            }}
            style={styles.cancelBtn}
          >
            <Text style={styles.cancelBtnText}>Leave Waiting Room</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Pre-call check ────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: C.bg }]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.avatarCircle, { backgroundColor: C.primary }]}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <Text style={[styles.headingName, { color: C.text }]}>
            {counsellorName || 'Session Ready'}
          </Text>
          {!!sessionDuration && (
            <View style={[styles.durationPill, { backgroundColor: C.sand }]}>
              <Clock size={12} color={C.primary} />
              <Text style={[styles.durationText, { color: C.primary }]}>{sessionDuration} min</Text>
            </View>
          )}
          <Text style={[styles.headingSubtitle, { color: C.muted }]}>
            Quick device check before joining
          </Text>
        </View>

        {/* Checks */}
        <View style={[styles.checksCard, { backgroundColor: C.card, borderColor: C.border }]}>
          <CheckRow
            icon={<Wifi size={18} color={C.primary} />}
            label="Internet"
            loading={checking}
            ok={networkOk}
            failLabel="No connection"
            C={C}
          />
          <View style={[styles.divider, { backgroundColor: C.border }]} />
          <CheckRow
            icon={<Video size={18} color={C.primary} />}
            label="Camera"
            loading={cameraPermission === null}
            ok={cameraPermission === true}
            failLabel="Permission needed"
            C={C}
          />
          <View style={[styles.divider, { backgroundColor: C.border }]} />
          <CheckRow
            icon={<Mic size={18} color={C.primary} />}
            label="Microphone"
            loading={micPermission === null}
            ok={micPermission === true}
            failLabel="Permission needed"
            C={C}
          />
        </View>

        {/* Permission hint */}
        {(micPermission === false || cameraPermission === false) && (
          <View style={[styles.hintBox, { backgroundColor: C.accentLight, borderColor: C.accent }]}>
            <Text style={[styles.hintText, { color: C.accent }]}>
              Go to Settings → Apps → Menorah Health → Permissions and enable Camera and Microphone.
            </Text>
          </View>
        )}

        {/* Join button */}
        <TouchableOpacity
          onPress={handleJoinSession}
          disabled={!allReady || loading || checking}
          style={[
            styles.joinBtn,
            { backgroundColor: allReady && !loading ? C.primary : C.border },
          ]}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <PhoneCall size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.joinBtnText}>Join Session</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={[styles.backBtnText, { color: C.muted }]}>Go Back</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Check row component ────────────────────────────────────────────────────

function CheckRow({
  icon, label, loading, ok, failLabel, C,
}: {
  icon: React.ReactNode;
  label: string;
  loading: boolean;
  ok: boolean;
  failLabel: string;
  C: Palette;
}) {
  return (
    <View style={styles.checkRow}>
      <View style={styles.checkRowLeft}>
        {icon}
        <Text style={[styles.checkLabel, { color: C.text }]}>{label}</Text>
      </View>
      {loading ? (
        <ActivityIndicator size="small" color={C.primary} />
      ) : ok ? (
        <View style={styles.checkStatus}>
          <CheckCircle size={16} color="#10b981" />
          <Text style={[styles.checkStatusText, { color: '#10b981' }]}>Ready</Text>
        </View>
      ) : (
        <View style={styles.checkStatus}>
          <XCircle size={16} color="#ef4444" />
          <Text style={[styles.checkStatusText, { color: '#ef4444' }]}>{failLabel}</Text>
        </View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex:           { flex: 1 },
  scrollContent:  { padding: 24, paddingBottom: 40 },

  // Header
  header:         { alignItems: 'center', marginBottom: 28 },
  avatarCircle:   {
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 6,
  },
  avatarText:     { color: '#fff', fontSize: 30, fontWeight: '700' },
  headingName:    { fontSize: 20, fontWeight: '700', marginBottom: 6 },
  durationPill:   {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginBottom: 8,
  },
  durationText:   { fontSize: 12, fontWeight: '600' },
  headingSubtitle:{ fontSize: 13, textAlign: 'center' },

  // Checks card
  checksCard: {
    borderRadius: 16, borderWidth: 1,
    marginBottom: 16, overflow: 'hidden',
  },
  checkRow:   {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  checkRowLeft:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  checkLabel:    { fontSize: 15, fontWeight: '500' },
  checkStatus:   { flexDirection: 'row', alignItems: 'center', gap: 5 },
  checkStatusText:{ fontSize: 13, fontWeight: '600' },
  divider:       { height: 1, marginHorizontal: 16 },

  // Hint
  hintBox: {
    borderRadius: 12, borderWidth: 1,
    padding: 12, marginBottom: 16,
  },
  hintText: { fontSize: 12, lineHeight: 18, fontWeight: '500' },

  // Join button
  joinBtn: {
    borderRadius: 16, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 4,
  },
  joinBtnText:  { color: '#fff', fontSize: 17, fontWeight: '700' },

  backBtn:      { alignItems: 'center', paddingVertical: 12 },
  backBtnText:  { fontSize: 15, fontWeight: '500' },

  // Waiting room
  waitingContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 28,
  },
  waitingAvatar: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: '#2d7a5c',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 18,
    shadowColor: '#3d9470', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5, shadowRadius: 16, elevation: 10,
  },
  waitingAvatarText: { color: '#fff', fontSize: 36, fontWeight: '700' },
  waitingName:       { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 4 },
  waitingDuration:   { color: 'rgba(255,255,255,0.5)', fontSize: 14, marginBottom: 28 },
  waitingCard: {
    width: '100%', backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20, padding: 24,
    alignItems: 'center', marginBottom: 32,
  },
  waitingCardTitle: {
    color: '#fff', fontSize: 16, fontWeight: '600',
    textAlign: 'center', marginBottom: 8,
  },
  waitingCardSub: {
    color: 'rgba(255,255,255,0.5)', fontSize: 13,
    textAlign: 'center', lineHeight: 20,
  },
  cancelBtn: {
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32,
  },
  cancelBtnText: { color: 'rgba(255,255,255,0.7)', fontSize: 15, fontWeight: '600' },
});
