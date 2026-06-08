import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Switch, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Eye, EyeOff, User, Lock } from 'lucide-react-native';
import { useThemeMode } from "@/theme/ThemeProvider";
import { palettes } from "@/theme/colors";
import { useAuth } from "@/state/useAuth";
import { api } from "@/lib/api";

export default function PrivacySettings({ navigation }: any) {
  const [profileVisibility, setProfileVisibility] = useState('public');
  const [showEmail, setShowEmail] = useState(true);
  const [showPhone, setShowPhone] = useState(false);
  const [allowMessages, setAllowMessages] = useState(true);
  const [loading, setLoading] = useState(false);

  const { user } = useAuth();
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];

  useEffect(() => {
    // Load user privacy preferences if available
    // This would come from user settings in a real implementation
  }, [user]);

  const handleProfileVisibilityChange = (value: string) => {
    setProfileVisibility(value);
    // TODO: Save to backend
    Alert.alert('Success', 'Profile visibility updated successfully.');
  };

  const handleShowEmailToggle = (value: boolean) => {
    setShowEmail(value);
    // TODO: Save to backend
  };

  const handleShowPhoneToggle = (value: boolean) => {
    setShowPhone(value);
    // TODO: Save to backend
  };

  const handleAllowMessagesToggle = (value: boolean) => {
    setAllowMessages(value);
    // TODO: Save to backend
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header */}
      <View style={{
        backgroundColor: colors.primary,
        paddingHorizontal: 16,
        paddingVertical: 20,
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24
      }}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <ArrowLeft size={24} color="white" />
        </TouchableOpacity>
        <Text style={{ 
          color: 'white', 
          fontSize: 20, 
          fontWeight: '700', 
          marginLeft: 16 
        }}>
          Privacy Settings
        </Text>
      </View>

      <ScrollView style={{ flex: 1, paddingHorizontal: 16, paddingTop: 24 }} showsVerticalScrollIndicator={false}>
        {/* Profile Visibility */}
        <View style={{ marginBottom: 24 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text, marginBottom: 16 }}>
            Profile Visibility
          </Text>
          <View style={{
            backgroundColor: colors.card,
            borderRadius: 20,
            padding: 16,
            borderWidth: 1,
            borderColor: colors.border
          }}>
            <Text style={{ fontSize: 14, color: colors.muted, marginBottom: 16 }}>
              Choose who can see your profile information
            </Text>
            <TouchableOpacity
              onPress={() => handleProfileVisibilityChange('public')}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: colors.border
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, color: colors.cardText, fontWeight: profileVisibility === 'public' ? '600' : '400' }}>
                  Public
                </Text>
                <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>
                  Everyone can see your profile
                </Text>
              </View>
              {profileVisibility === 'public' && (
                <View style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  backgroundColor: colors.primary,
                  borderWidth: 4,
                  borderColor: colors.primary + '40'
                }} />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleProfileVisibilityChange('counsellors')}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: colors.border
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, color: colors.cardText, fontWeight: profileVisibility === 'counsellors' ? '600' : '400' }}>
                  Counsellors Only
                </Text>
                <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>
                  Only counsellors can see your profile
                </Text>
              </View>
              {profileVisibility === 'counsellors' && (
                <View style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  backgroundColor: colors.primary,
                  borderWidth: 4,
                  borderColor: colors.primary + '40'
                }} />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleProfileVisibilityChange('private')}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 12
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, color: colors.cardText, fontWeight: profileVisibility === 'private' ? '600' : '400' }}>
                  Private
                </Text>
                <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>
                  Only you can see your profile
                </Text>
              </View>
              {profileVisibility === 'private' && (
                <View style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  backgroundColor: colors.primary,
                  borderWidth: 4,
                  borderColor: colors.primary + '40'
                }} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Contact Information */}
        <View style={{ marginBottom: 24 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text, marginBottom: 16 }}>
            Contact Information
          </Text>
          <View style={{
            backgroundColor: colors.card,
            borderRadius: 20,
            padding: 16,
            borderWidth: 1,
            borderColor: colors.border
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 }}>
              <View style={{ flex: 1, marginRight: 16 }}>
                <Text style={{ fontSize: 16, color: colors.cardText, marginBottom: 4 }}>
                  Show Email Address
                </Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>
                  Allow others to see your email
                </Text>
              </View>
              <Switch
                value={showEmail}
                onValueChange={handleShowEmailToggle}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            </View>
            <View style={{ 
              height: 1, 
              backgroundColor: colors.border, 
              marginVertical: 8 
            }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 }}>
              <View style={{ flex: 1, marginRight: 16 }}>
                <Text style={{ fontSize: 16, color: colors.cardText, marginBottom: 4 }}>
                  Show Phone Number
                </Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>
                  Allow others to see your phone number
                </Text>
              </View>
              <Switch
                value={showPhone}
                onValueChange={handleShowPhoneToggle}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            </View>
          </View>
        </View>

        {/* Messages */}
        <View style={{ marginBottom: 24 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text, marginBottom: 16 }}>
            Messages
          </Text>
          <View style={{
            backgroundColor: colors.card,
            borderRadius: 20,
            padding: 16,
            borderWidth: 1,
            borderColor: colors.border
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, marginRight: 16 }}>
                <Text style={{ fontSize: 16, color: colors.cardText, marginBottom: 4 }}>
                  Allow Messages
                </Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>
                  Let counsellors send you messages
                </Text>
              </View>
              <Switch
                value={allowMessages}
                onValueChange={handleAllowMessagesToggle}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

