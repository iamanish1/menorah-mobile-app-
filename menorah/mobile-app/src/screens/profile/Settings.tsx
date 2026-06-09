import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Switch, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  BookOpen,
  FileText,
  HelpCircle,
  KeyRound,
  LifeBuoy,
  LogOut,
  Moon,
  Shield,
  Trash2,
  UserLock,
  Users,
} from 'lucide-react-native';
import { useThemeMode } from "@/theme/ThemeProvider";
import { palettes } from "@/theme/colors";
import { useAuth } from "@/state/useAuth";
import { api } from "@/lib/api";

const SettingItem = ({ title, subtitle, icon: Icon, onPress, disabled, colors, danger = false }: any) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={disabled}
    style={{
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      paddingHorizontal: 16
    }}
  >
    <View style={{
      width: 40,
      height: 40,
      backgroundColor: danger ? colors.error + '18' : colors.border,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 16,
      flexShrink: 0
    }}>
      <Icon size={20} color={danger ? colors.error : colors.muted} />
    </View>
    <View style={{ flex: 1, paddingRight: 4 }}>
      <Text style={{ fontSize: 16, color: danger ? colors.error : colors.cardText }}>{title}</Text>
      {subtitle && <Text style={{ fontSize: 14, color: colors.muted, marginTop: 4 }}>{subtitle}</Text>}
    </View>
  </TouchableOpacity>
);

export default function Settings({ navigation }: any) {
  const [notifications, setNotifications] = useState(true);
  const [emailUpdates, setEmailUpdates] = useState(true);
  const [loading, setLoading] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  const { scheme, toggle } = useThemeMode();
  const colors = palettes[scheme];
  const isDark = scheme === 'dark';
  const headerBg = isDark ? colors.primaryDark : colors.primary;
  const dangerBg = colors.error + (isDark ? '18' : '0A');
  const dangerBorder = colors.error + (isDark ? '35' : '20');
  const { logout, user } = useAuth();

  useEffect(() => {
    if (user?.notificationPreferences) {
      setNotifications(user.notificationPreferences.push || true);
      setEmailUpdates(user.notificationPreferences.email || true);
    }
  }, [user]);

  const handleNotificationToggle = async (value: boolean) => {
    setNotifications(value);
    setLoading(true);
    try {
      const response = await api.updateNotificationPreferences({ push: value });
      if (!response.success) {
        // Revert on error
        setNotifications(!value);
        Alert.alert('Error', 'Failed to update notification preferences.');
      }
    } catch (error) {
      console.error('Error updating notifications:', error);
      setNotifications(!value);
      Alert.alert('Error', 'Failed to update notification preferences.');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailToggle = async (value: boolean) => {
    setEmailUpdates(value);
    setLoading(true);
    try {
      const response = await api.updateNotificationPreferences({ email: value });
      if (!response.success) {
        // Revert on error
        setEmailUpdates(!value);
        Alert.alert('Error', 'Failed to update email preferences.');
      }
    } catch (error) {
      console.error('Error updating email preferences:', error);
      setEmailUpdates(!value);
      Alert.alert('Error', 'Failed to update email preferences.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Logout', 
          style: 'destructive', 
          onPress: async () => {
            try {
              // Call logout to clear auth state and disconnect socket
              await logout();
              // Navigate to Login screen after logout completes
              // Get root navigator to ensure proper reset
              const rootNavigation = navigation.getParent() || navigation;
              rootNavigation.reset({
                index: 0,
                routes: [{ name: 'Login' }],
              });
            } catch (error) {
              console.error('Logout error:', error);
              // Even if logout fails, still navigate to login
              const rootNavigation = navigation.getParent() || navigation;
              rootNavigation.reset({
                index: 0,
                routes: [{ name: 'Login' }],
              });
            }
          }
        }
      ]
    );
  };

  const resetToLogin = async () => {
    try {
      await logout();
    } finally {
      const rootNavigation = navigation.getParent() || navigation;
      rootNavigation.reset({
        index: 0,
        routes: [{ name: 'Login' }],
      });
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will request deletion of your account and personal data. Some records may be retained if required for legal, safety, payment, or dispute obligations.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Request Deletion',
          style: 'destructive',
          onPress: async () => {
            setDeletingAccount(true);
            try {
              const response = await api.requestAccountDeletion();
              if (response.success) {
                Alert.alert(
                  'Request Submitted',
                  'Your account deletion request has been submitted. You will be signed out now.',
                  [{ text: 'OK', onPress: resetToLogin }]
                );
              } else {
                Alert.alert(
                  'Request Not Submitted',
                  response.message ||
                    'Account deletion is not fully connected yet. Please contact support to request deletion manually.'
                );
              }
            } catch (error) {
              console.error('Account deletion request error:', error);
              Alert.alert(
                'Request Not Submitted',
                'Account deletion is not fully connected yet. Please contact support to request deletion manually.'
              );
            } finally {
              setDeletingAccount(false);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header */}
      <View style={{
        backgroundColor: headerBg,
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
          Settings
        </Text>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {/* Notifications */}
        <View style={{ paddingHorizontal: 16, paddingTop: 24, paddingBottom: 24 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text, marginBottom: 16 }}>
            Notifications
          </Text>
          <View style={{
            backgroundColor: colors.card,
            borderRadius: 20,
            padding: 16,
            borderWidth: 1,
            borderColor: colors.border
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 16 }}>
              <View style={{
                width: 40,
                height: 40,
                backgroundColor: colors.border,
                borderRadius: 20,
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 16
              }}>
                <Bell size={20} color={colors.muted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, color: colors.cardText }}>Push Notifications</Text>
                <Text style={{ fontSize: 14, color: colors.muted }}>Receive session reminders</Text>
              </View>
              <Switch
                value={notifications}
                onValueChange={handleNotificationToggle}
                trackColor={{ false: colors.border, true: colors.primary }}
                disabled={loading}
              />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 16 }}>
              <View style={{
                width: 40,
                height: 40,
                backgroundColor: colors.border,
                borderRadius: 20,
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 16
              }}>
                <Moon size={20} color={colors.muted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, color: colors.cardText }}>Dark Mode</Text>
                <Text style={{ fontSize: 14, color: colors.muted }}>Switch to dark theme</Text>
              </View>
              <Switch
                value={scheme === 'dark'}
                onValueChange={toggle}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 16 }}>
              <View style={{
                width: 40,
                height: 40,
                backgroundColor: colors.border,
                borderRadius: 20,
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 16
              }}>
                <FileText size={20} color={colors.muted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, color: colors.cardText }}>Email Updates</Text>
                <Text style={{ fontSize: 14, color: colors.muted }}>Receive email notifications</Text>
              </View>
              <Switch
                value={emailUpdates}
                onValueChange={handleEmailToggle}
                trackColor={{ false: colors.border, true: colors.primary }}
                disabled={loading}
              />
            </View>
          </View>
        </View>

        {/* Account */}
        <View style={{ paddingHorizontal: 16, paddingBottom: 24 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text, marginBottom: 16 }}>
            Account
          </Text>
          <View style={{
            backgroundColor: colors.card,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden'
          }}>
            <SettingItem
              title="Delete Account"
              subtitle="Request deletion of your account and personal data"
              icon={Trash2}
              onPress={handleDeleteAccount}
              disabled={deletingAccount}
              danger
              colors={colors}
            />
          </View>
        </View>

        {/* Privacy & Security */}
        <View style={{ paddingHorizontal: 16, paddingBottom: 24 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text, marginBottom: 16 }}>
            Privacy & Security
          </Text>
          <View style={{
            backgroundColor: colors.card,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden'
          }}>
            <SettingItem
              title="Change Password"
              subtitle="Update your password"
              icon={KeyRound}
              onPress={() => navigation.navigate("ChangePassword")}
              colors={colors}
            />
            <SettingItem
              title="Privacy Settings"
              subtitle="Manage your privacy"
              icon={UserLock}
              onPress={() => navigation.navigate("PrivacySettings")}
              colors={colors}
            />
          </View>
        </View>

        {/* Support */}
        <View style={{ paddingHorizontal: 16, paddingBottom: 24 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text, marginBottom: 16 }}>
            Support
          </Text>
          <View style={{
            backgroundColor: colors.card,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden'
          }}>
            <SettingItem
              title="Help & Support"
              subtitle="Crisis guidance and urgent help"
              icon={HelpCircle}
              onPress={() => navigation.navigate("CrisisHelp")}
              colors={colors}
            />
            <SettingItem
              title="Contact Support"
              subtitle="Email and safety contact information"
              icon={LifeBuoy}
              onPress={() => navigation.navigate("Legal", { type: 'support' })}
              colors={colors}
            />
            <SettingItem
              title="Privacy Policy"
              subtitle="How account, chat, and booking data is handled"
              icon={Shield}
              onPress={() => navigation.navigate("Legal", { type: 'privacy' })}
              colors={colors}
            />
            <SettingItem
              title="Terms of Service"
              subtitle="Rules for using Menorah Health"
              icon={FileText}
              onPress={() => navigation.navigate("Legal", { type: 'terms' })}
              colors={colors}
            />
            <SettingItem
              title="Community Guidelines"
              subtitle="Safety rules for chat and peer support"
              icon={Users}
              onPress={() => navigation.navigate("Legal", { type: 'community' })}
              colors={colors}
            />
            <SettingItem
              title="Wellness Disclaimer"
              subtitle="Not medical care or emergency service"
              icon={BookOpen}
              onPress={() => navigation.navigate("Legal", { type: 'wellness' })}
              colors={colors}
            />
            <SettingItem
              title="Crisis Disclaimer"
              subtitle="What to do in immediate danger"
              icon={AlertTriangle}
              onPress={() => navigation.navigate("Legal", { type: 'crisis' })}
              colors={colors}
            />
          </View>
        </View>

        {/* Logout */}
        <View style={{ paddingHorizontal: 16, paddingBottom: 24 }}>
          <TouchableOpacity
            onPress={handleLogout}
            style={{
              backgroundColor: dangerBg,
              borderRadius: 20,
              padding: 16,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              borderWidth: 1,
              borderColor: dangerBorder
            }}
          >
            <LogOut size={20} color={colors.error} />
            <Text style={{ color: colors.error, fontWeight: '600', fontSize: 16 }}>Logout</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
