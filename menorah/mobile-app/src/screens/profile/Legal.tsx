import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertTriangle, ArrowLeft, FileText, Heart, HelpCircle, Shield, Users } from 'lucide-react-native';
import { useThemeMode } from "@/theme/ThemeProvider";
import { palettes } from "@/theme/colors";

export default function Legal({ route, navigation }: any) {
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];

  const privacyPolicy = `Privacy Policy

Last updated: December 2024

1. Information We Collect
We collect information you provide directly to us, such as account details, profile details, booking details, chat content, support requests, and preferences needed to operate the service.

2. How We Use Your Information
We use this information to provide mental wellness support, peer support features, self-help and educational resources, booking workflows, account security, customer support, and service improvements.

3. Information Sharing
We do not sell your personal information. We may share information with service providers only when needed to operate the app, process support requests, maintain safety, process payments, or comply with legal obligations.

4. Chat and Community Data
Messages, reports, and support requests may be reviewed by authorized support or moderation team members when needed for safety, abuse prevention, troubleshooting, or legal compliance.

5. Data Security
We use reasonable safeguards to protect personal information against unauthorized access, alteration, disclosure, or destruction. No app or network service can guarantee absolute security.

6. Your Rights and Account Deletion
You can request access, correction, or deletion of your personal information. Account deletion can be requested from Settings > Account > Delete Account. Some records may be retained if required for legal, safety, dispute, tax, or payment obligations.

7. Contact Us
If you have questions about this Privacy Policy, please contact us at privacy@menorah.me.`;

  const termsOfService = `TERMS AND CONDITIONS - MENORAH HEALTH LLP

These Terms and Conditions govern your use of the Menorah Health mobile application ("App"), provided by Menorah Health LLP ("Menorah," "we," "us," or "our"). By using the App, you agree to these terms. If you do not agree, please do not use the App.

1. App Usage and Eligibility
You must be old enough to use this app under the laws that apply to you. If you are under the age of majority, use the app only with consent and supervision from a parent or legal guardian.

2. Purpose of the App
Menorah Health provides mental wellness support, peer support, self-help tools, educational resources, and access to trained supporters or counsellors. The app does not diagnose, treat, cure, or replace professional medical care.

3. Not an Emergency Service
The app is not an emergency service. If you are in immediate danger, may harm yourself or someone else, or need urgent medical help, contact local emergency services immediately.

4. User Conduct
Use the app responsibly. Do not harass, threaten, impersonate others, share illegal content, share another person's private information, or use the app to cause harm.

5. Content Usage
Content, exercises, articles, and resources are for general wellness and educational support only. You may not copy, sell, or redistribute app content without permission.

6. Safety and Moderation
Users can report unsafe content or behavior, block users where available, and contact support. Menorah may restrict or remove accounts that violate these terms or create safety risks.

7. Feedback and Suggestions
We appreciate your feedback and suggestions regarding the App. By submitting feedback, you grant Menorah the right to use and implement your suggestions without any obligation to compensate you.

8. Intellectual Property
The Menorah logo, name, and any related content are protected by intellectual property laws. You may not use these materials without obtaining explicit permission from Menorah.

9. Disclaimers and Limitation of Liability
The App is provided "as is." Menorah does not guarantee specific mental health outcomes, recovery, diagnosis, treatment, or uninterrupted service.

10. Changes to the Agreement
Menorah reserves the right to modify this Agreement at any time. Any changes will be communicated through the App or other means. Continued use of the App after such changes indicates your acceptance of the modified Agreement.

11. Termination
Menorah may suspend or terminate your access to the App at our discretion if you violate this Agreement or engage in any harmful conduct. You may also terminate your use of the App at any time.

12. Governing Law
This Agreement is governed by and construed in accordance with the laws of India. Any disputes arising from or relating to this Agreement will be subject to the exclusive jurisdiction of the courts in India.

Contact Us:
If you have any questions or concerns about these Terms and Conditions, please contact us at menorahenquries@gmail.com

By using the Menorah App, you acknowledge that you have read, understood, and agreed to the terms outlined in this Agreement.`;

  const communityGuidelines = `Community Guidelines

Menorah Health is designed for respectful mental wellness support, peer support, and educational discussion.

1. Be respectful
Do not harass, threaten, bully, shame, discriminate, or target another person.

2. Protect privacy
Do not share another person's private information, screenshots, messages, contact details, or sensitive personal information without consent.

3. Keep support safe
Do not encourage self-harm, violence, abuse, illegal activity, or unsafe medical decisions. If someone appears to be in immediate danger, contact local emergency services.

4. No medical claims
Users should not present themselves as diagnosing, treating, curing, or replacing professional medical care.

5. Reporting and blocking
You can report messages or users from chat and contact support from Settings. Reports may be reviewed by authorized support or moderation team members. Blocking helps limit unwanted contact where supported by the service.

6. Enforcement
Menorah may remove content, restrict features, or suspend accounts that create safety risks or violate these guidelines.`;

  const wellnessDisclaimer = `Mental Wellness Disclaimer

Menorah Health provides mental wellness support, peer support, self-help tools, and educational resources.

The app does not diagnose, treat, cure, prevent, or replace professional medical or mental healthcare. Information in the app is for general wellness and educational support only.

If you have a medical or mental health condition, or if you are making decisions about care, speak with a qualified healthcare professional.

This app is not an emergency service. If you are in immediate danger, may harm yourself or someone else, or need urgent help, contact local emergency services immediately.`;

  const supportInfo = `Support / Contact

For app support, account questions, privacy questions, or safety concerns, contact:

General support: menorahenquries@gmail.com
Privacy: privacy@menorah.me

For unsafe content or behavior in chat, use the report options in the chat screen where available and include the conversation context in your support request.

For urgent danger, self-harm risk, medical emergencies, or threats to another person, do not wait for app support. Contact local emergency services immediately.`;

  const contentMap = {
    privacy: {
      title: 'Privacy Policy',
      subtitle: 'How we handle account, chat, booking, and support data',
      body: privacyPolicy,
      icon: Shield,
    },
    terms: {
      title: 'Terms of Service',
      subtitle: 'Rules for using Menorah Health safely',
      body: termsOfService,
      icon: FileText,
    },
    community: {
      title: 'Community Guidelines',
      subtitle: 'Safety rules for chat and peer support',
      body: communityGuidelines,
      icon: Users,
    },
    wellness: {
      title: 'Wellness Disclaimer',
      subtitle: 'Important limits of this app',
      body: wellnessDisclaimer,
      icon: Heart,
    },
    crisis: {
      title: 'Crisis Disclaimer',
      subtitle: 'This app is not for emergencies',
      body: wellnessDisclaimer,
      icon: AlertTriangle,
    },
    support: {
      title: 'Support / Contact',
      subtitle: 'How to contact Menorah Health',
      body: supportInfo,
      icon: HelpCircle,
    },
  } as const;

  type LegalType = keyof typeof contentMap;
  const requestedType = route.params?.type as LegalType | undefined;
  const content = requestedType && contentMap[requestedType] ? contentMap[requestedType] : contentMap.terms;
  const Icon = content.icon;

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
          {content.title}
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
            <Icon size={32} color={colors.primary} />
          </View>
          <Text style={{ 
            fontSize: 22, 
            fontWeight: '700', 
            color: colors.text, 
            marginBottom: 8 
          }}>
            {content.title}
          </Text>
          <Text style={{ 
            fontSize: 14, 
            color: colors.muted, 
            textAlign: 'center' 
          }}>
            {content.subtitle}
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
            {content.body}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
