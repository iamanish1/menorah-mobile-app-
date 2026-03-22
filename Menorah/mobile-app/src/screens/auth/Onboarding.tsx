import React from 'react';
import { View, Text, Linking, ScrollView } from "react-native";
import { SafeAreaView } from 'react-native-safe-area-context';
import Button from "@/components/ui/Button";
import { useThemeMode } from "@/theme/ThemeProvider";
import { palettes } from "@/theme/colors";

export default function Onboarding({ navigation }: any) {
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView 
        style={{ flex: 1 }}
        contentContainerStyle={{ 
          flexGrow: 1,
          paddingHorizontal: 24,
          paddingTop: 40,
          paddingBottom: 32,
          justifyContent: 'space-between'
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Section */}
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          {/* Logo */}
          <View style={{
            width: 100,
            height: 100,
            backgroundColor: colors.primary,
            borderRadius: 50,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 32,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.1,
            shadowRadius: 8,
            elevation: 4,
          }}>
            <Text style={{
              fontSize: 48,
              fontWeight: 'bold',
              color: 'white'
            }}>
              🧠
            </Text>
          </View>

          {/* Welcome Text */}
          <Text style={{ 
            fontSize: 32, 
            fontWeight: '700', 
            color: colors.text, 
            marginBottom: 16,
            textAlign: 'center'
          }}>
            Welcome to Menorah Health
          </Text>
          
          <Text style={{ 
            fontSize: 16, 
            color: colors.muted,
            textAlign: 'center',
            lineHeight: 24,
            paddingHorizontal: 8
          }}>
            Private, secure counselling. If you're in crisis, tap Help for local helplines.
          </Text>
        </View>

        {/* Bottom Section */}
        <View style={{ width: '100%' }}>
          <Button 
            title="Get Started" 
            onPress={() => navigation.navigate("Login")}
            style={{ marginBottom: 12 }}
          />
          
          <Button
            title="Help & Helplines"
            variant="outline"
            onPress={() => Linking.openURL("https://menorahhealth.com/")}
            style={{ marginBottom: 24 }}
          />
          
          <Text style={{ 
            fontSize: 12, 
            color: colors.muted,
            textAlign: 'center',
            lineHeight: 18
          }}>
            By continuing, you agree to our{' '}
            <Text 
              onPress={() => Linking.openURL("https://menorahhealth.com/terms-and-conditions")}
              style={{ color: colors.primary, fontWeight: '600' }}
            >
              Terms
            </Text>
            {' '}and{' '}
            <Text 
              onPress={() => Linking.openURL("https://menorahhealth.app/privacy-policy")}
              style={{ color: colors.primary, fontWeight: '600' }}
            >
              Privacy Policy
            </Text>
            .
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
