import React, { useState, useEffect } from 'react';
import * as AppleAuthentication from 'expo-apple-authentication';
import { reportError } from '@/lib/safeDiagnostics';
import { View, Text, ScrollView, TouchableOpacity, Switch, Alert, Modal, TextInput, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  BookOpen,
  FileText,
  HelpCircle,
  KeyRound,
  Link2,
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
import { useNotifications } from '@/state/useNotifications';

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
  const [emailUpdates, setEmailUpdates] = useState(true);
  const [loading, setLoading] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deletionPassword, setDeletionPassword] = useState('');
  const [showDeletionConfirmation, setShowDeletionConfirmation] = useState(false);

  const { scheme, toggle } = useThemeMode();
  const colors = palettes[scheme];
  const isDark = scheme === 'dark';
  const headerBg = isDark ? colors.primaryDark : colors.primary;
  const dangerBg = colors.error + (isDark ? '18' : '0A');
  const dangerBorder = colors.error + (isDark ? '35' : '20');
  const { forgotPassword, invalidateSession, logout, user } = useAuth();
  const {
    pushEnabled,
    pushLoading,
    pushPermission,
    setPushNotificationsEnabled,
  } = useNotifications();
  const deletionMethod = Platform.OS === 'ios' && user?.reauthenticationMethods?.apple
    ? 'apple'
    : user?.reauthenticationMethods?.password
      ? 'password'
      : 'password-setup';

  useEffect(() => {
    if (user?.notificationPreferences) {
      setEmailUpdates(user.notificationPreferences.email ?? true);
    }
  }, [user]);

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
      reportError('settings.email_preference_update_failed', error);
      setEmailUpdates(!value);
      Alert.alert('Error', 'Failed to update email preferences.');
    } finally {
      setLoading(false);
    }
  };

  const handlePushToggle = async (value: boolean) => {
    const updated = await setPushNotificationsEnabled(value);
    if (!updated) {
      Alert.alert(
        value ? 'Push notifications not enabled' : 'Unable to update notifications',
        value && pushPermission === 'denied'
          ? 'Allow notifications for Menorah in Android Settings, then try again.'
          : 'Please check your connection and try again.'
      );
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
              reportError('settings.logout_failed', error);
              Alert.alert(
                'Signed Out Securely',
                'Credential cleanup is still pending and will be retried before another sign-in.',
              );
            }
          }
        }
      ]
    );
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
          onPress: () => setShowDeletionConfirmation(true),
        },
      ]
    );
  };

  const completeAcceptedDeletion = async (response: { success: boolean; message?: string }) => {
    if (response.success) {
        let cleanupPending = false;
        try {
          await invalidateSession();
        } catch (error) {
          cleanupPending = true;
          reportError('settings.disabled_account_cleanup_pending', error);
        }
        setShowDeletionConfirmation(false);
        setDeletionPassword('');
        Alert.alert(
          'Request Submitted',
          cleanupPending
            ? 'Your account is disabled and the request is queued. Local credential cleanup will finish before another sign-in.'
            : 'Your account is disabled and the deletion request is queued for retention review.',
        );
        return true;
    }
    Alert.alert('Request Not Submitted', response.message || 'We could not submit your deletion request.');
    return false;
  };

  const submitAccountDeletion = async () => {
    setDeletingAccount(true);
    try {
      const response = await api.requestAccountDeletion({
        method: 'password',
        password: deletionPassword,
      });
      await completeAcceptedDeletion(response);
    } catch {
      reportError('settings.account_deletion_request_failed');
      Alert.alert('Request Not Submitted', 'We could not submit your deletion request.');
    } finally {
      setDeletingAccount(false);
    }
  };

  const submitAppleAccountDeletion = async () => {
    if (Platform.OS !== 'ios') {
      Alert.alert('Apple verification unavailable', 'Use an iOS device linked to this Apple account.');
      return;
    }

    setDeletingAccount(true);
    try {
      const challenge = await api.createAccountDeletionChallenge();
      if (!challenge.success || !challenge.data) {
        Alert.alert('Verification Not Started', challenge.message || 'Please try again.');
        return;
      }
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [],
        nonce: challenge.data.nonce,
        state: challenge.data.challengeId,
      });
      if (
        !credential.identityToken
        || !credential.authorizationCode
        || credential.state !== challenge.data.challengeId
      ) {
        Alert.alert('Verification Failed', 'Apple did not return the required deletion authorization.');
        return;
      }
      const response = await api.requestAccountDeletion({
        method: 'apple',
        challengeId: challenge.data.challengeId,
        identityToken: credential.identityToken,
        authorizationCode: credential.authorizationCode,
      });
      await completeAcceptedDeletion(response);
    } catch (error: any) {
      if (error?.code !== 'ERR_REQUEST_CANCELED') {
        reportError('settings.apple_account_deletion_failed', error);
        Alert.alert('Request Not Submitted', 'Apple verification or the deletion request failed. Please try again.');
      }
    } finally {
      setDeletingAccount(false);
    }
  };

  const sendDeletionPasswordSetup = async () => {
    if (!user?.email) return;
    setDeletingAccount(true);
    try {
      const response = await forgotPassword(user.email);
      if (response.success) {
        setShowDeletionConfirmation(false);
        Alert.alert(
          'Check Your Email',
          'Use the secure password-reset link to set a deletion password. After resetting, sign in again and return here to delete your account.',
        );
      } else {
        Alert.alert('Link Not Sent', response.message || 'Please try again.');
      }
    } catch (error) {
      reportError('settings.deletion_password_setup_failed', error);
      Alert.alert('Link Not Sent', 'Please try again.');
    } finally {
      setDeletingAccount(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Modal
        visible={showDeletionConfirmation}
        transparent
        animationType="fade"
        onRequestClose={() => !deletingAccount && setShowDeletionConfirmation(false)}
      >
        <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 12, padding: 20 }}>
            <Text style={{ color: colors.cardText, fontSize: 18, fontWeight: '700', marginBottom: 8 }}>Confirm deletion request</Text>
            <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 20, marginBottom: 16 }}>
              {deletionMethod === 'apple'
                ? 'Continue with the linked Apple account. Menorah will disable account access and durably queue Apple authorization revocation.'
                : deletionMethod === 'password'
                  ? 'Enter your password to disable account access and submit the deletion request for review.'
                  : 'This social account has no deletion password. Send a secure setup link to your verified email, then sign in again to finish deletion.'}
            </Text>
            {deletionMethod === 'password' ? (
              <TextInput
                value={deletionPassword}
                onChangeText={setDeletionPassword}
                placeholder="Current password"
                placeholderTextColor={colors.muted}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                editable={!deletingAccount}
                style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, color: colors.text, paddingHorizontal: 12, paddingVertical: 12 }}
              />
            ) : null}
            {deletionMethod === 'apple' ? (
              deletingAccount ? (
                <ActivityIndicator color={colors.primary} size="small" />
              ) : (
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                  cornerRadius={8}
                  style={{ width: '100%', height: 46 }}
                  onPress={submitAppleAccountDeletion}
                />
              )
            ) : null}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 20 }}>
              <TouchableOpacity
                disabled={deletingAccount}
                onPress={() => { setDeletionPassword(''); setShowDeletionConfirmation(false); }}
                style={{ paddingHorizontal: 12, paddingVertical: 10 }}
              >
                <Text style={{ color: colors.muted, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              {deletionMethod !== 'apple' ? (
                <TouchableOpacity
                  disabled={deletingAccount || (deletionMethod === 'password' && !deletionPassword)}
                  onPress={deletionMethod === 'password' ? submitAccountDeletion : sendDeletionPasswordSetup}
                  style={{ backgroundColor: colors.error, borderRadius: 8, minWidth: 98, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center', opacity: deletingAccount || (deletionMethod === 'password' && !deletionPassword) ? 0.6 : 1 }}
                >
                  {deletingAccount
                    ? <ActivityIndicator color="white" size="small" />
                    : <Text style={{ color: 'white', fontWeight: '700' }}>{deletionMethod === 'password' ? 'Confirm' : 'Send Setup Link'}</Text>}
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>
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
                <Text style={{ fontSize: 14, color: colors.muted }}>
                  {Platform.OS !== 'android'
                    ? 'Available on Android'
                    : pushPermission === 'denied'
                      ? 'Permission is disabled in Android Settings'
                      : 'Chat, session reminders and new articles'}
                </Text>
              </View>
              {pushLoading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Switch
                  value={pushEnabled}
                  onValueChange={handlePushToggle}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  disabled={Platform.OS !== 'android'}
                />
              )}
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
            {user?.role === 'user' && user.isEmailVerified ? (
              <SettingItem
                title="Linked Sign-In Accounts"
                subtitle="Add Google or Apple sign-in securely"
                icon={Link2}
                onPress={() => navigation.navigate("LinkedAccounts")}
                colors={colors}
              />
            ) : null}
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
