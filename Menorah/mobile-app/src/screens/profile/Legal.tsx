import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, FileText, Shield } from 'lucide-react-native';
import { useThemeMode } from "@/theme/ThemeProvider";
import { palettes } from "@/theme/colors";

export default function Legal({ route, navigation }: any) {
  const { type } = route.params || { type: 'terms' };
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];

  const privacyPolicy = `Privacy Policy

Last updated: December 2024

1. Information We Collect
We collect information you provide directly to us, such as when you create an account, book sessions, or contact us for support.

2. How We Use Your Information
We use the information we collect to provide, maintain, and improve our services, communicate with you, and ensure your safety.

3. Information Sharing
We do not sell, trade, or otherwise transfer your personal information to third parties without your consent, except as described in this policy.

4. Data Security
We implement appropriate security measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction.

5. Your Rights
You have the right to access, correct, or delete your personal information. Contact us to exercise these rights.

6. Contact Us
If you have questions about this Privacy Policy, please contact us at privacy@menorahhealth.com.`;

  const termsOfService = `TERMS AND CONDITIONS - MENORAH HEALTH LLP

These Terms and Conditions ("Agreement") govern your use of the Menorah mobile application ("App"), provided by Menorah Mental Health Organization ("Menorah," "we," "us," or "our"). By using the Menorah App, you agree to abide by these terms. If you do not agree with any part of this Agreement, please do not use the App.

1. App Usage and Eligibility:
The minimum age requirement to be an eligible user of Menorah App is 12 years. For individual aged 12- 18 years , you need to access this app with consent of a legal guardian. By accessing and using this app, you confirm that you are eligible and have the legal capacity to enter into this Agreement.

2. Privacy and Confidentiality:
We take your privacy and confidentiality seriously. Your interactions within the App, including chats with clinical psychologist students and peers, are secure and anonymous. We collect and handle your personal information in accordance with our Privacy Policy.

3. Professional Advice:
Menorah's main aim is to open up a forum to communicate about mental health and it's importance. The clinical psychologist students on the App provide advice, however they are not a substitute for professional mental health treatment.  The provided guidance is not intended to replace the professional services of licensed practitioners. If our team advices you to consult a licensed practitioner or a certified senior consultant, it is important that you do so.This does not put any sort of responsibility or liability on Menorah with regards to the further consultation.

4. User Conduct:
You agree to use the App responsibly and refrain from engaging in any harmful, offensive, or inappropriate behavior. You will not impersonate others, distribute harmful content, or violate any applicable laws or regulations.

5. Content Usage:
Any content, including text, images, videos, or resources provided through the App, is for informational purposes only. You may not use, reproduce, or distribute such content without proper authorization from Menorah.

6. Feedback and Suggestions:
We appreciate your feedback and suggestions regarding the App. By submitting feedback, you grant Menorah the right to use and implement your suggestions without any obligation to compensate you.

7. Intellectual Property:
The Menorah logo, name, and any related content are protected by intellectual property laws. You may not use these materials without obtaining explicit permission from Menorah.

8. Disclaimers and Limitation of Liability:
The App is provided "as is," and Menorah does not make any warranties or guarantees regarding its accuracy, reliability, or effectiveness. We shall not be liable for any direct, indirect, or consequential damages arising from your use of the App.

9. Changes to the Agreement:
Menorah reserves the right to modify this Agreement at any time. Any changes will be communicated through the App or other means. Continued use of the App after such changes indicates your acceptance of the modified Agreement.

10. Termination:
Menorah may suspend or terminate your access to the App at our discretion if you violate this Agreement or engage in any harmful conduct. You may also terminate your use of the App at any time.

11. Governing Law:
This Agreement is governed by and construed in accordance with the laws of India. Any disputes arising from or relating to this Agreement will be subject to the exclusive jurisdiction of the courts in India.

Contact Us:
If you have any questions or concerns about these Terms and Conditions, please contact us at menorahenquries@gmail.com

By using the Menorah App, you acknowledge that you have read, understood, and agreed to the terms outlined in this Agreement.`;

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
          {type === 'privacy' ? 'Privacy Policy' : 'Terms of Service'}
        </Text>
      </View>

      <ScrollView style={{ flex: 1, paddingHorizontal: 16, paddingTop: 24 }} showsVerticalScrollIndicator={false}>
        {/* Icon */}
        <View style={{ alignItems: 'center' }}>
          <View style={{
            width: 64,
            height: 64,
            backgroundColor: colors.primary + '1A',
            borderRadius: 32,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16
          }}>
            {type === 'privacy' ? (
              <Shield size={32} color={colors.primary} />
            ) : (
              <FileText size={32} color={colors.primary} />
            )}
          </View>
          <Text style={{ 
            fontSize: 22, 
            fontWeight: '700', 
            color: colors.text, 
            marginBottom: 8 
          }}>
            {type === 'privacy' ? 'Privacy Policy' : 'Terms of Service'}
          </Text>
          <Text style={{ 
            fontSize: 14, 
            color: colors.muted, 
            textAlign: 'center' 
          }}>
            {type === 'privacy' 
              ? 'How we protect and handle your personal information'
              : 'Our terms and conditions for using Menorah Health'
            }
          </Text>
        </View>

        {/* Content */}
        <View style={{
          backgroundColor: colors.card,
          borderRadius: 20,
          padding: 20,
          marginTop: 24,
          borderWidth: 1,
          borderColor: colors.border
        }}>
          <Text style={{
            fontSize: 16,
            color: colors.cardText,
            lineHeight: 24
          }}>
            {type === 'privacy' ? privacyPolicy : termsOfService}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
