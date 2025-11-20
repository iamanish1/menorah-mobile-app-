import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Switch, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Shield, Smartphone } from 'lucide-react-native';
import { useThemeMode } from "@/theme/ThemeProvider";
import { palettes } from "@/theme/colors";
import { useAuth } from "@/state/useAuth";

export default function TwoFactorAuth({ navigation }: any) {
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const { user } = useAuth();

  const { scheme } = useThemeMode();
  const colors = palettes[scheme];

  const handleToggle = (value: boolean) => {
    Alert.alert(
      value ? 'Enable Two-Factor Authentication' : 'Disable Two-Factor Authentication',
      value
        ? 'This will add an extra layer of security to your account. You will need to verify your identity using your phone when logging in.'
        : 'Are you sure you want to disable two-factor authentication? This will make your account less secure.',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => {} },
        {
          text: value ? 'Enable' : 'Disable',
          style: value ? 'default' : 'destructive',
          onPress: () => {
            setTwoFactorEnabled(value);
            // TODO: Implement actual 2FA API call
            Alert.alert(
              'Coming Soon',
              'Two-factor authentication feature is coming soon. This will be implemented in a future update.',
              [{ text: 'OK' }]
            );
          }
        }
      ]
    );
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
          Two-Factor Authentication
        </Text>
      </View>

      <ScrollView style={{ flex: 1, paddingHorizontal: 16, paddingTop: 24 }} showsVerticalScrollIndicator={false}>
        {/* Info Card */}
        <View style={{
          backgroundColor: colors.card,
          borderRadius: 20,
          padding: 20,
          marginBottom: 24,
          borderWidth: 1,
          borderColor: colors.border
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <View style={{
              width: 48,
              height: 48,
              backgroundColor: colors.primary + '1A',
              borderRadius: 24,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 12
            }}>
              <Shield size={24} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: '600', color: '#000000', marginBottom: 4 }}>
                Enhanced Security
              </Text>
              <Text style={{ fontSize: 14, color: colors.muted }}>
                Protect your account with an extra layer of security
              </Text>
            </View>
          </View>
        </View>

        {/* Main Toggle */}
        <View style={{
          backgroundColor: colors.card,
          borderRadius: 20,
          padding: 20,
          marginBottom: 24,
          borderWidth: 1,
          borderColor: colors.border
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, marginRight: 16 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: '#000000', marginBottom: 4 }}>
                Two-Factor Authentication
              </Text>
              <Text style={{ fontSize: 14, color: colors.muted }}>
                {twoFactorEnabled 
                  ? 'Enabled - Your account is protected with 2FA'
                  : 'Disabled - Enable to add extra security'
                }
              </Text>
            </View>
            <Switch
              value={twoFactorEnabled}
              onValueChange={handleToggle}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>
        </View>

        {/* How it works */}
        <View style={{
          backgroundColor: colors.card,
          borderRadius: 20,
          padding: 20,
          marginBottom: 24,
          borderWidth: 1,
          borderColor: colors.border
        }}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: '#000000', marginBottom: 16 }}>
            How it works
          </Text>
          <View style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', marginBottom: 8 }}>
              <View style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                backgroundColor: colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 12
              }}>
                <Text style={{ color: 'white', fontSize: 12, fontWeight: '600' }}>1</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, color: colors.cardText, lineHeight: 20 }}>
                  When you enable 2FA, you'll receive a verification code on your registered phone number
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', marginBottom: 8 }}>
              <View style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                backgroundColor: colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 12
              }}>
                <Text style={{ color: 'white', fontSize: 12, fontWeight: '600' }}>2</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, color: colors.cardText, lineHeight: 20 }}>
                  Each time you log in, you'll need to enter this code along with your password
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row' }}>
              <View style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                backgroundColor: colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 12
              }}>
                <Text style={{ color: 'white', fontSize: 12, fontWeight: '600' }}>3</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, color: colors.cardText, lineHeight: 20 }}>
                  This adds an extra layer of protection to keep your account secure
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Phone Number Info */}
        {user?.phone && (
          <View style={{
            backgroundColor: colors.card,
            borderRadius: 20,
            padding: 20,
            marginBottom: 24,
            borderWidth: 1,
            borderColor: colors.border
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <Smartphone size={20} color={colors.primary} style={{ marginRight: 12 }} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#000000' }}>
                Verification Phone Number
              </Text>
            </View>
            <Text style={{ fontSize: 16, color: colors.cardText, marginLeft: 32 }}>
              {user.phone}
            </Text>
            <Text style={{ fontSize: 12, color: colors.muted, marginTop: 8, marginLeft: 32 }}>
              Verification codes will be sent to this number
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

