import React from "react";
import { View, Text, ScrollView, TouchableOpacity, Alert, InteractionManager } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { BookOpen, Heart, HelpCircle, Settings, Shield, FileText, LogOut, ChevronRight } from "lucide-react-native";
import { useThemeMode } from "@/theme/ThemeProvider";
import { palettes } from "@/theme/colors";
import { useAuth } from "@/state/useAuth";
import { CommonActions, useNavigation } from "@react-navigation/native";

export default function ProfileHome({ navigation }: any) {
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const { logout, user } = useAuth();
  const rootNavigation = useNavigation();

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Sign Out', 
          style: 'destructive', 
          onPress: async () => {
            try {
              // Call logout to clear auth state and disconnect socket
              await logout();
              
              // Use InteractionManager to wait for all interactions (including Alert dismissal) to complete
              // This prevents the ModalPortal removeChild error
              InteractionManager.runAfterInteractions(() => {
                // Add a small delay on top of InteractionManager to ensure Alert is fully dismissed
                setTimeout(() => {
                  try {
                    // Navigate to Onboarding - try root navigator first
                    const rootNav = navigation.getParent()?.getParent();
                    if (rootNav && rootNav.reset) {
                      rootNav.reset({
                        index: 0,
                        routes: [{ name: 'Onboarding' }],
                      });
                    } else {
                      // Fallback: use CommonActions
                      rootNavigation.dispatch(
                        CommonActions.reset({
                          index: 0,
                          routes: [{ name: 'Onboarding' }],
                        })
                      );
                    }
                  } catch (navError) {
                    console.error('Navigation error:', navError);
                  }
                }, 200);
              });
            } catch (error) {
              console.error('Sign out error:', error);
              // Try to navigate anyway - logout might have cleared auth state
              InteractionManager.runAfterInteractions(() => {
                setTimeout(() => {
                  try {
                    const rootNav = navigation.getParent()?.getParent();
                    if (rootNav && rootNav.reset) {
                      rootNav.reset({
                        index: 0,
                        routes: [{ name: 'Onboarding' }],
                      });
                    } else {
                      rootNavigation.dispatch(
                        CommonActions.reset({
                          index: 0,
                          routes: [{ name: 'Onboarding' }],
                        })
                      );
                    }
                  } catch (navError) {
                    console.error('Navigation error:', navError);
                  }
                }, 200);
              });
            }
          }
        }
      ],
      { cancelable: true }
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header */}
      <View style={{
        backgroundColor: colors.primary,
        paddingHorizontal: 16,
        paddingVertical: 28,
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {user?.profileImage ? (
            <Image
              source={{ uri: user.profileImage }}
              style={{ width: 60, height: 60, borderRadius: 30, marginRight: 16 }}
              contentFit="cover"
            />
          ) : (
            <View style={{
              width: 60,
              height: 60,
              borderRadius: 30,
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 16
            }}>
              <Text style={{ fontSize: 24, fontWeight: '700', color: 'white' }}>
                {user?.firstName?.charAt(0)?.toUpperCase() || 'U'}
              </Text>
            </View>
          )}
          <View>
            <Text style={{ fontSize: 20, fontWeight: '700', color: 'white', marginBottom: 4 }}>
              {user ? `${user.firstName} ${user.lastName}` : 'User'}
            </Text>
            <Text style={{ fontSize: 14, color: 'rgba(255, 255, 255, 0.8)' }}>
              {user?.email || 'No email'}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {/* Quick Actions */}
        <View style={{ paddingHorizontal: 16, marginTop: 20, marginBottom: 20 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text, marginBottom: 12 }}>
            Quick Actions
          </Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity
              onPress={() => navigation.navigate("Bookings")}
              style={{
                flex: 1,
                backgroundColor: colors.card,
                borderRadius: 20,
                padding: 16,
                alignItems: 'center',
                borderWidth: 1,
                borderColor: colors.border
              }}
            >
              <BookOpen size={24} color={colors.primary} />
              <Text style={{ fontSize: 12, color: colors.cardText, textAlign: 'center', fontWeight: '500', marginTop: 8 }}>
                Book Your First Session
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              onPress={() => navigation.navigate("CrisisHelp")}
              style={{
                flex: 1,
                backgroundColor: colors.card,
                borderRadius: 20,
                padding: 16,
                alignItems: 'center',
                borderWidth: 1,
                borderColor: colors.border
              }}
            >
              <Heart size={24} color={colors.primary} />
              <Text style={{ fontSize: 12, color: colors.cardText, textAlign: 'center', fontWeight: '500', marginTop: 8 }}>
                Wellness Resources
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              onPress={() => navigation.navigate("CrisisHelp")}
              style={{
                flex: 1,
                backgroundColor: colors.card,
                borderRadius: 20,
                padding: 16,
                alignItems: 'center',
                borderWidth: 1,
                borderColor: colors.border
              }}
            >
              <HelpCircle size={24} color={colors.primary} />
              <Text style={{ fontSize: 12, color: colors.cardText, textAlign: 'center', fontWeight: '500', marginTop: 8 }}>
                Get Support
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Wellness Tip */}
        <View style={{ paddingHorizontal: 16, marginBottom: 20 }}>
          <View style={{
            backgroundColor: colors.card,
            borderRadius: 20,
            padding: 20,
            borderWidth: 1,
            borderColor: colors.border
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Heart size={20} color={colors.primary} />
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.cardText, marginLeft: 8 }}>
                Wellness Tip
              </Text>
            </View>
            <Text style={{ fontSize: 14, color: colors.cardText, lineHeight: 20 }}>
              Taking care of yourself isn't selfish. It's essential. Remember to breathe deeply and practice self-compassion today.
            </Text>
          </View>
        </View>

        {/* Account Settings */}
        <View style={{ paddingHorizontal: 16, marginBottom: 20 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text, marginBottom: 16 }}>
            Account
          </Text>
          <View style={{
            backgroundColor: colors.card,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: colors.border
          }}>
            <TouchableOpacity
              onPress={() => navigation.navigate("EditProfile")}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 16,
                borderBottomWidth: 1,
                borderBottomColor: colors.border
              }}
            >
              <Settings size={20} color={colors.primary} />
              <Text style={{ flex: 1, fontSize: 16, color: colors.cardText, marginLeft: 12 }}>Edit Profile</Text>
              <ChevronRight size={20} color={colors.muted} />
            </TouchableOpacity>
            
            <TouchableOpacity
              onPress={() => navigation.navigate("Settings")}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 16,
                borderBottomWidth: 1,
                borderBottomColor: colors.border
              }}
            >
              <Shield size={20} color={colors.primary} />
              <Text style={{ flex: 1, fontSize: 16, color: colors.cardText, marginLeft: 12 }}>Settings and Privacy</Text>
              <ChevronRight size={20} color={colors.muted} />
            </TouchableOpacity>
            
            <TouchableOpacity
              onPress={() => navigation.navigate("Legal")}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 16,
                borderBottomWidth: 1,
                borderBottomColor: colors.border
              }}
            >
              <FileText size={20} color={colors.primary} />
              <Text style={{ flex: 1, fontSize: 16, color: colors.cardText, marginLeft: 12 }}>Terms & Privacy</Text>
              <ChevronRight size={20} color={colors.muted} />
            </TouchableOpacity>
            
            <TouchableOpacity
              onPress={handleSignOut}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 16
              }}
            >
              <LogOut size={20} color="#EF4444" />
              <Text style={{ flex: 1, fontSize: 16, color: "#EF4444", marginLeft: 12 }}>Sign Out</Text>
              <ChevronRight size={20} color="#EF4444" />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
