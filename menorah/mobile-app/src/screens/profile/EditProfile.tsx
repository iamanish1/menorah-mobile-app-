import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Camera, Mail, Phone } from 'lucide-react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import Input from '@/components/ui/Input';
import { useThemeMode } from "@/theme/ThemeProvider";
import { palettes } from "@/theme/colors";
import { useAuth } from "@/state/useAuth";
import { api } from "@/lib/api";
import { displayPhone, isUsablePhone } from '@/lib/authPolicy';

export default function EditProfile({ navigation, route }: any) {
  const {
    user,
    updateUser,
    logout,
    requiresProfileCompletion,
  } = useAuth();
  const fromSocialAuth =
    requiresProfileCompletion
    || (
      route?.params?.fromSocialAuth === true
      && user?.profileCompleted !== true
    );
  const [selectedImage, setSelectedImage] = useState<{
    uri: string;
    name?: string;
    type?: string;
  } | null>(null);
  const [formData, setFormData] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    email: user?.email || '',
    phone: displayPhone(user?.phone),
    dateOfBirth: user?.dateOfBirth || '',
    gender: user?.gender || 'prefer-not-to-say',
    profileImage: user?.profileImage || ''
  });
  const [loading, setLoading] = useState(false);

  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const isDark = scheme === 'dark';
  const headerBg = isDark ? colors.primaryDark : colors.primary;
  const primaryActionText = isDark ? colors.primaryDark : 'white';

  useEffect(() => {
    if (user) {
      setFormData({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email || '',
        phone: displayPhone(user.phone),
        dateOfBirth: user.dateOfBirth || '',
        gender: user.gender || 'prefer-not-to-say',
        profileImage: user.profileImage || ''
      });
    }
  }, [user]);

  const handleSave = async () => {
    if (!formData.firstName || !formData.lastName) {
      Alert.alert('Validation Error', 'Please fill in all required fields.');
      return;
    }

    const normalizedPhone = formData.phone.replace(/[\s()-]/g, '');
    if (fromSocialAuth && !isUsablePhone(normalizedPhone)) {
      Alert.alert(
        'Valid phone required',
        'Enter your phone in international format with country code, for example +919876543210.',
      );
      return;
    }

    setLoading(true);
    try {
      const profileResponse = selectedImage
        ? await api.updateProfileWithImage({
            firstName: formData.firstName,
            lastName: formData.lastName,
            dateOfBirth: formData.dateOfBirth,
            gender: formData.gender,
            profileImage: selectedImage
          })
        : await api.updateProfile({
            firstName: formData.firstName,
            lastName: formData.lastName,
            dateOfBirth: formData.dateOfBirth,
            gender: formData.gender,
            profileImage: formData.profileImage
          });

      if (!profileResponse.success || !profileResponse.data?.user) {
        Alert.alert('Error', profileResponse.message || 'Failed to update profile. Please try again.');
        return;
      }

      const finalResponse = fromSocialAuth
        ? await api.completeProfile(normalizedPhone)
        : profileResponse;

      if (!finalResponse.success || !finalResponse.data?.user) {
        Alert.alert(
          'Could not complete profile',
          finalResponse.message || 'Check your phone number and try again.',
        );
        return;
      }

      updateUser(finalResponse.data.user);
      setSelectedImage(null);
      Alert.alert(
        fromSocialAuth ? 'Profile complete' : 'Success',
        fromSocialAuth
          ? 'Your contact details were saved. You can now use all patient features.'
          : 'Profile updated successfully!',
        [{
          text: 'OK',
          onPress: () => fromSocialAuth
            ? navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] })
            : navigation.canGoBack()
              ? navigation.goBack()
              : navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] }),
        }],
      );
    } catch (error: any) {
      console.error('Error updating profile:', error);
      Alert.alert('Error', 'Failed to update profile. Please try again.');
    } finally {
      setLoading(false);
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
            setLoading(true);
            try {
              const response = await api.requestAccountDeletion();
              if (response.success) {
                Alert.alert(
                  'Request Submitted',
                  'Your account deletion request has been submitted. You will be signed out now.',
                  [
                    {
                      text: 'OK',
                      onPress: async () => {
                        await logout();
                        navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
                      },
                    },
                  ]
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
              setLoading(false);
            }
          },
        }
      ]
    );
  };

  const handleBack = () => {
    if (!fromSocialAuth) {
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });
      }
      return;
    }

    Alert.alert(
      'Complete your profile',
      'A verified phone number is required before you can continue. You can stay here or sign out.',
      [
        { text: 'Stay', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: logout,
        },
      ],
    );
  };

  const handlePickImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          'Permission Required',
          'Please allow photo library access to upload a profile picture.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      const asset = result.assets[0];
      const filename = asset.fileName || `profile-${Date.now()}.jpg`;
      const mimeType = asset.mimeType || 'image/jpeg';

      setSelectedImage({
        uri: asset.uri,
        name: filename,
        type: mimeType,
      });

      setFormData((prev) => ({
        ...prev,
        profileImage: asset.uri,
      }));
    } catch (error) {
      console.error('Image picker error:', error);
      Alert.alert('Upload Failed', 'Unable to select image. Please try again.');
    }
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
        <TouchableOpacity onPress={handleBack}>
          <ArrowLeft size={24} color="white" />
        </TouchableOpacity>
        <Text style={{ 
          color: 'white', 
          fontSize: 20, 
          fontWeight: '700', 
          marginLeft: 16, 
          flex: 1 
        }}>
          Edit Profile
        </Text>
        <TouchableOpacity onPress={handleSave} disabled={loading}>
          {loading ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Text style={{ color: 'white', fontWeight: '600' }}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 24,
          paddingBottom: 120
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Photo */}
        <View style={{ alignItems: 'center' }}>
          <View style={{ position: 'relative' }}>
            {formData.profileImage ? (
              <Image
                source={{ uri: formData.profileImage }}
                style={{ width: 96, height: 96, borderRadius: 48 }}
                contentFit="cover"
              />
            ) : (
              <View style={{
                width: 96,
                height: 96,
                backgroundColor: colors.border,
                borderRadius: 48,
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Text style={{ fontSize: 36, fontWeight: '700', color: colors.muted }}>
                  {formData.firstName?.charAt(0)?.toUpperCase() || 'U'}
                </Text>
              </View>
            )}
            <TouchableOpacity 
              onPress={handlePickImage}
              style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                backgroundColor: colors.primary,
                borderRadius: 20,
                padding: 8
              }}
            >
              <Camera size={20} color={primaryActionText} />
            </TouchableOpacity>
          </View>
          <Text style={{ 
            color: colors.muted, 
            marginTop: 8,
            fontSize: 14
          }}>
            Tap to choose a profile photo
          </Text>
        </View>

        {/* Form */}
        <View style={{ marginTop: 32 }}>
          {/* First Name */}
          <Input
            label="First Name"
            value={formData.firstName}
            onChangeText={(text) => setFormData({ ...formData, firstName: text })}
            placeholder="Enter your first name"
          />
          
          {/* Last Name */}
          <Input
            label="Last Name"
            value={formData.lastName}
            onChangeText={(text) => setFormData({ ...formData, lastName: text })}
            placeholder="Enter your last name"
            style={{ marginTop: 16 }}
          />
          
          {/* Email - Read Only */}
          <View style={{ marginTop: 16 }}>
            <Text style={{ 
              fontSize: 14, 
              fontWeight: '500', 
              color: colors.text, 
              marginBottom: 8 
            }}>
              Email
            </Text>
            <View style={{
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 16,
              paddingHorizontal: 16,
              paddingVertical: 12,
              flexDirection: 'row',
              alignItems: 'center'
            }}>
              <Mail size={20} color={colors.muted} style={{ marginRight: 12 }} />
              <Text style={{ 
                fontSize: 16, 
                color: colors.muted,
                flex: 1
              }}>
                {formData.email}
              </Text>
            </View>
          </View>
          
          {/* Phone is required for social-account profile completion. */}
          <View style={{ marginTop: 16 }}>
            <Text style={{ 
              fontSize: 14, 
              fontWeight: '500', 
              color: colors.text, 
              marginBottom: 8 
            }}>
              Phone Number
            </Text>
            {fromSocialAuth ? (
              <View style={{
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 16,
                paddingHorizontal: 16,
                flexDirection: 'row',
                alignItems: 'center'
              }}>
                <Phone size={20} color={colors.muted} style={{ marginRight: 12 }} />
                <TextInput
                  value={formData.phone}
                  onChangeText={(phone) => setFormData({ ...formData, phone })}
                  placeholder="+919876543210"
                  placeholderTextColor={colors.muted}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                  style={{
                    flex: 1,
                    color: colors.cardText,
                    paddingVertical: 14,
                    fontSize: 16,
                  }}
                />
              </View>
            ) : (
              <View style={{
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 16,
                paddingHorizontal: 16,
                paddingVertical: 12,
                flexDirection: 'row',
                alignItems: 'center'
              }}>
                <Phone size={20} color={colors.muted} style={{ marginRight: 12 }} />
                <Text style={{ fontSize: 16, color: colors.muted, flex: 1 }}>
                  {formData.phone || 'Not added'}
                </Text>
              </View>
            )}
            {fromSocialAuth ? (
              <Text style={{ marginTop: 8, color: colors.muted, fontSize: 12, lineHeight: 17 }}>
                Include the country code. This completes the required contact profile for your social account.
              </Text>
            ) : null}
          </View>
        </View>

        {/* Save Button */}
        <View style={{ marginTop: 32 }}>
          <TouchableOpacity
            onPress={handleSave}
            style={{
              backgroundColor: colors.primary,
              borderRadius: 12,
              paddingVertical: 16,
              alignItems: 'center'
            }}
          >
            <Text style={{ color: primaryActionText, fontSize: 16, fontWeight: '600' }}>
              Save Changes
            </Text>
          </TouchableOpacity>
        </View>

        {/* Delete Account */}
        <View style={{ 
          marginTop: 32, 
          paddingTop: 24, 
          borderTopWidth: 1, 
          borderTopColor: colors.border 
        }}>
          <TouchableOpacity
            onPress={handleDeleteAccount}
            style={{
              backgroundColor: colors.error + (isDark ? '18' : '0A'),
              borderRadius: 16,
              padding: 16,
              alignItems: 'center',
              marginBottom: 32
            }}
          >
            <Text style={{ color: colors.error, fontWeight: '600' }}>Delete Account</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
