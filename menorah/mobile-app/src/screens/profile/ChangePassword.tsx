import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react-native';
import { useThemeMode } from "@/theme/ThemeProvider";
import { palettes } from "@/theme/colors";
import { api } from "@/lib/api";
import Input from "@/components/ui/Input";

export default function ChangePassword({ navigation }: any) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { scheme } = useThemeMode();
  const colors = palettes[scheme];

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!currentPassword) {
      newErrors.currentPassword = 'Current password is required';
    }

    if (!newPassword) {
      newErrors.newPassword = 'New password is required';
    } else if (newPassword.length < 8) {
      newErrors.newPassword = 'Password must be at least 8 characters';
    }

    if (!confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (newPassword !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    if (currentPassword === newPassword) {
      newErrors.newPassword = 'New password must be different from current password';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChangePassword = async () => {
    if (!validate()) {
      return;
    }

    setLoading(true);
    try {
      const response = await api.changePassword(currentPassword, newPassword);
      
      if (response.success) {
        Alert.alert(
          'Success',
          'Your password has been changed successfully.',
          [
            {
              text: 'OK',
              onPress: () => navigation.goBack()
            }
          ]
        );
      } else {
        Alert.alert('Error', response.message || 'Failed to change password. Please try again.');
      }
    } catch (error: any) {
      console.error('Change password error:', error);
      Alert.alert('Error', 'Failed to change password. Please check your current password and try again.');
    } finally {
      setLoading(false);
    }
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
          Change Password
        </Text>
      </View>

      <ScrollView style={{ flex: 1, paddingHorizontal: 16, paddingTop: 24 }} showsVerticalScrollIndicator={false}>
        <Text style={{ 
          fontSize: 14, 
          color: colors.muted, 
          marginBottom: 24,
          lineHeight: 20
        }}>
          Please enter your current password and choose a new password. Make sure your new password is at least 8 characters long.
        </Text>

        {/* Current Password */}
        <View style={{ marginBottom: 16 }}>
          <Text style={{ 
            fontSize: 14, 
            fontWeight: '600', 
            color: colors.text, 
            marginBottom: 8 
          }}>
            Current Password
          </Text>
          <View style={{
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: errors.currentPassword ? '#EF4444' : colors.border,
            borderRadius: 12,
            paddingHorizontal: 16,
            flexDirection: 'row',
            alignItems: 'center'
          }}>
            <Input
              placeholder="Enter your current password"
              value={currentPassword}
              onChangeText={(text) => {
                setCurrentPassword(text);
                if (errors.currentPassword) {
                  setErrors({ ...errors, currentPassword: '' });
                }
              }}
              secureTextEntry={!showCurrentPassword}
              style={{
                flex: 1,
                borderWidth: 0,
                backgroundColor: 'transparent',
                paddingVertical: 12,
                fontSize: 16,
                color: colors.cardText,
                marginBottom: 0
              }}
            />
            <TouchableOpacity onPress={() => setShowCurrentPassword(!showCurrentPassword)}>
              {showCurrentPassword ? (
                <EyeOff size={20} color={colors.muted} />
              ) : (
                <Eye size={20} color={colors.muted} />
              )}
            </TouchableOpacity>
          </View>
          {errors.currentPassword && (
            <Text style={{ fontSize: 12, color: '#EF4444', marginTop: 4, marginLeft: 4 }}>
              {errors.currentPassword}
            </Text>
          )}
        </View>

        {/* New Password */}
        <View style={{ marginBottom: 16 }}>
          <Text style={{ 
            fontSize: 14, 
            fontWeight: '600', 
            color: colors.text, 
            marginBottom: 8 
          }}>
            New Password
          </Text>
          <View style={{
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: errors.newPassword ? '#EF4444' : colors.border,
            borderRadius: 12,
            paddingHorizontal: 16,
            flexDirection: 'row',
            alignItems: 'center'
          }}>
            <Input
              placeholder="Enter your new password"
              value={newPassword}
              onChangeText={(text) => {
                setNewPassword(text);
                if (errors.newPassword) {
                  setErrors({ ...errors, newPassword: '' });
                }
                if (confirmPassword && text !== confirmPassword) {
                  setErrors({ ...errors, confirmPassword: 'Passwords do not match' });
                } else if (confirmPassword && text === confirmPassword) {
                  const newErrors = { ...errors };
                  delete newErrors.confirmPassword;
                  setErrors(newErrors);
                }
              }}
              secureTextEntry={!showNewPassword}
              style={{
                flex: 1,
                borderWidth: 0,
                backgroundColor: 'transparent',
                paddingVertical: 12,
                fontSize: 16,
                color: colors.cardText,
                marginBottom: 0
              }}
            />
            <TouchableOpacity onPress={() => setShowNewPassword(!showNewPassword)}>
              {showNewPassword ? (
                <EyeOff size={20} color={colors.muted} />
              ) : (
                <Eye size={20} color={colors.muted} />
              )}
            </TouchableOpacity>
          </View>
          {errors.newPassword && (
            <Text style={{ fontSize: 12, color: '#EF4444', marginTop: 4, marginLeft: 4 }}>
              {errors.newPassword}
            </Text>
          )}
        </View>

        {/* Confirm Password */}
        <View style={{ marginBottom: 24 }}>
          <Text style={{ 
            fontSize: 14, 
            fontWeight: '600', 
            color: colors.text, 
            marginBottom: 8 
          }}>
            Confirm New Password
          </Text>
          <View style={{
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: errors.confirmPassword ? '#EF4444' : 
                        (confirmPassword && newPassword === confirmPassword ? '#10B981' : colors.border),
            borderRadius: 12,
            paddingHorizontal: 16,
            flexDirection: 'row',
            alignItems: 'center'
          }}>
            <Input
              placeholder="Confirm your new password"
              value={confirmPassword}
              onChangeText={(text) => {
                setConfirmPassword(text);
                if (text && text !== newPassword) {
                  setErrors({ ...errors, confirmPassword: 'Passwords do not match' });
                } else if (errors.confirmPassword) {
                  const newErrors = { ...errors };
                  delete newErrors.confirmPassword;
                  setErrors(newErrors);
                }
              }}
              secureTextEntry={!showConfirmPassword}
              style={{
                flex: 1,
                borderWidth: 0,
                backgroundColor: 'transparent',
                paddingVertical: 12,
                fontSize: 16,
                color: colors.cardText,
                marginBottom: 0
              }}
            />
            <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
              {showConfirmPassword ? (
                <EyeOff size={20} color={colors.muted} />
              ) : (
                <Eye size={20} color={colors.muted} />
              )}
            </TouchableOpacity>
          </View>
          {errors.confirmPassword && (
            <Text style={{ fontSize: 12, color: '#EF4444', marginTop: 4, marginLeft: 4 }}>
              {errors.confirmPassword}
            </Text>
          )}
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          onPress={handleChangePassword}
          disabled={loading}
          style={{
            backgroundColor: loading ? colors.muted : colors.primary,
            borderRadius: 12,
            paddingVertical: 16,
            alignItems: 'center',
            marginBottom: 24,
            opacity: loading ? 0.7 : 1
          }}
        >
          {loading ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>
              Change Password
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

