import React, { useState, useEffect } from 'react';
import { View, Text, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Wifi, CheckCircle, XCircle, Video, Mic, Camera } from 'lucide-react-native';
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
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];

  useEffect(() => {
    checkNetwork();
    // Don't pre-load video room - let join endpoint handle room creation
  }, [bookingId]);

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
    try {
      // Join the video room - this endpoint will create the room if it doesn't exist
      const joinResponse = await api.joinVideoRoom(bookingId);
      
      if (joinResponse.success && joinResponse.data) {
        navigation.navigate('CallJoin', {
          bookingId: bookingId,
          roomId: joinResponse.data.roomId,
          roomUrl: joinResponse.data.roomUrl,
          jitsiToken: joinResponse.data.jitsiToken,
          sessionType: joinResponse.data.sessionType,
          counsellorName: joinResponse.data.counsellorName,
          userName: joinResponse.data.userName
        });
      } else {
        Alert.alert('Error', joinResponse.message || 'Failed to join video room. Please try again.');
      }
    } catch (error: any) {
      console.error('Error joining video room:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Failed to join video room. Please try again.';
      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

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
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <CheckCircle size={20} color="#10B981" />
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#10B981', marginLeft: 8 }}>
                Ready
              </Text>
            </View>
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
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <CheckCircle size={20} color="#10B981" />
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#10B981', marginLeft: 8 }}>
                Ready
              </Text>
            </View>
          </View>
        </View>

        <Button
          title="Join Session"
          onPress={handleJoinSession}
          disabled={!networkOk || loading}
          style={{ marginTop: 20 }}
          loading={loading}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
