import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertTriangle, ArrowLeft, FileText, Heart, HelpCircle, Shield, Users } from 'lucide-react-native';
import { useThemeMode } from "@/theme/ThemeProvider";
import { palettes } from "@/theme/colors";

export default function Legal({ route, navigation }: any) {
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const isDark = scheme === 'dark';
  const headerBg = isDark ? colors.primaryDark : colors.primary;

const privacyPolicy = `Privacy Policy
Menorah Health | Effective: November 11, 2025 | Updated: July 22, 2026 | v1.1

1. About This Policy
Menorah Health ('Company', 'we', 'us', or 'our') operates a digital men's mental health platform accessible via mobile application and website (collectively, the 'Platform'). This Privacy Policy explains how we collect, use, store, share, and protect your personal data. It also sets out your rights as a user.

By creating an account or using the Platform, you consent to the data practices described in this Policy. If you do not agree, please discontinue use of the Platform immediately.

2. Definitions
Personal Data: Any information relating to an identified or identifiable natural person, including name, email, health data, and device identifiers.

Sensitive Personal Data (SPD): Health records, mental health history, session notes, biometric data, and financial data — as defined under SPDI Rules 2011 and DPDP Act 2023.

Data Fiduciary: Menorah Health, as the entity that determines the purposes and means of processing your data (equivalent to 'data controller' under GDPR).

Data Principal: You, the individual user whose personal data is being processed.

Processing: Any operation on personal data including collection, storage, use, disclosure, or deletion.

3. Data We Collect

3.1 Data You Provide Directly
• Registration data: name, date of birth, email address, phone number, gender identity
• Health and wellness data: mood logs, journal entries, symptom check-ins, mental health assessments
• Session communications and notes. Audio/video session recording is not currently enabled.
• Payment data: billing details processed via PCI-DSS compliant payment gateways; we do not store card numbers
• Communications: messages, feedback, support queries
• Optional face-check data: one selfie, face-detection results, confidence score, consent evidence, submission and review history, and basic image-file metadata

3.2 Data Collected Automatically
• Device data: device type, OS, app version, unique device identifiers (UDID/IDFA/GAID)
• Usage data: features accessed, session duration, clickstream data
• Log data: IP address, timestamps, crash reports
• Location data: approximate location derived from IP (not GPS), unless you grant location permission

3.3 Data From Third Parties
• Therapist-provided clinical notes and assessments
• Payment gateway transaction references
• App store analytics (anonymised, aggregated only)

4. Purposes of Processing & Legal Basis
Providing therapy and wellness services: Consent + Contract under India law; Art. 6(1)(b) – Contract under EU/GDPR.

Processing mental health data: Explicit Consent under DPDP/MHCA; Art. 9(2)(a) – Explicit Consent under EU/GDPR.

Payment processing: Contract performance under India law; Art. 6(1)(b) – Contract under EU/GDPR.

Platform safety and crisis intervention: Legitimate interest / vital interests under India law; Art. 6(1)(d) – Vital Interests under EU/GDPR.

Product improvement (anonymised): Legitimate interest under India law; Art. 6(1)(f) – Legitimate Interest under EU/GDPR.

Legal compliance and audit: Legal obligation under India law; Art. 6(1)(c) – Legal Obligation under EU/GDPR.

Marketing (opt-in only): Consent under India law; Art. 6(1)(a) – Consent under EU/GDPR.

Optional face check: Explicit consent under India law; Art. 9(2)(a) – Explicit Consent under EU/GDPR. The check detects a face for account trust and safety; it does not verify a government-issued identity document.

5. Data Sharing & Disclosure

5.1 With Therapists
Your session data and health records are shared with the therapist assigned to you on the Platform, strictly for the purpose of providing therapeutic services.

5.2 With Service Providers
We engage third-party processors (cloud storage, payment gateways, analytics providers) under Data Processing Agreements that restrict them to processing your data only on our instructions.

If you choose the optional face check, your selfie is sent to Luxand, Inc. in the United States for facial analysis. Luxand may generate facial geometry or other biometric information. Review the notice shown before submission and Luxand's privacy policy at https://www.luxand.com/privacy.php.

5.3 Legal Disclosure
We may disclose data where required by Indian law, court order, or a competent authority. We will notify you where legally permissible before complying with such requests.

5.4 Crisis Situations
If we reasonably believe a user is at imminent risk of self-harm or harm to others, we may share necessary information with emergency services without prior consent, consistent with our obligations under the MHCA 2017 and Telemedicine Practice Guidelines 2020.

5.5 We Never Sell Your Data
Menorah Health does not sell, rent, or trade your personal data to advertisers or any third party for commercial purposes.

6. Data Retention
• Therapy session notes and clinical records: 7 years from last session (minimum), as recommended under MHCA 2017 guidelines
• Account data: for the duration of your account, plus 3 years after deletion for legal compliance
• Payment records: 8 years (as required under Indian tax laws)
• Optional face-check records: up to 365 days from submission, unless law, a legal hold, fraud investigation, or unresolved security matter requires longer retention
• Marketing data: until you withdraw consent
• Anonymised analytics data: indefinitely

7. Data Security
We implement the following safeguards:
• AES-256 encryption for data at rest; TLS 1.3 for data in transit
• Role-based access control — therapists can only access their own clients' data
• Multi-factor authentication for all practitioner accounts
• Regular third-party penetration testing and vulnerability assessments
• Primary application data is hosted on approved infrastructure; specifically disclosed providers may process limited data outside India under contractual and transfer safeguards
• Data breach notification: we will notify affected users and the Data Protection Board of India within 72 hours of becoming aware of a breach, as required under DPDP Rules 2025

8. Your Rights

8.1 Rights Under DPDP Act 2023 (Indian Users)
• Right to access: obtain a summary of personal data held and how it is being processed
• Right to correction: correct inaccurate or incomplete personal data
• Right to erasure: request deletion of your data (subject to legal retention requirements)
• Right to grievance redressal: raise complaints with our Grievance Officer
• Right to nominate: nominate a person to exercise rights on your behalf in case of incapacity or death

8.2 Additional Rights Under GDPR (EU/EEA Users)
• Right to data portability: receive your data in a structured, machine-readable format
• Right to object: object to processing based on legitimate interests
• Right to restrict processing: request we limit how your data is used
• Right to lodge a complaint with your national supervisory authority

8.3 Additional Rights Under CCPA (California Users)
• Right to know what personal information is collected and how it is used
• Right to opt-out of any sale of personal information (we do not sell)
• Right to non-discrimination for exercising your rights

9. Cookies & Tracking
Our web platform uses cookies and similar technologies for authentication, security, and analytics. You may control cookie preferences through your browser settings. We do not use third-party advertising cookies.

10. Children's Privacy
The Platform is strictly intended for users aged 18 and above. We do not knowingly collect data from minors. If we discover that a minor has provided data without parental consent, we will delete it immediately.

11. International Data Transfers
Some service providers process limited data outside India. In particular, an optional face-check selfie is sent to Luxand, Inc. and its contracted infrastructure providers in the United States. We require appropriate contractual and transfer safeguards and disclose the provider before obtaining explicit consent.

12. Changes to This Policy
We may update this Policy. Material changes will be notified via email and in-app notification at least 15 days before they take effect. Continued use of the Platform after the effective date constitutes acceptance of the revised Policy.`;

  const termsOfService = `Terms and Conditions
Menorah Health | Effective: November 11, 2025 | v1.0

1. Agreement to Terms
These Terms and Conditions ('Terms') constitute a legally binding agreement between you ('User') and Menorah Health ('Company') governing your use of the Menorah Health mobile application, website, and all associated services (the 'Platform'). By registering or using the Platform, you confirm you have read, understood, and agree to be bound by these Terms.

If you do not agree to these Terms, you must not access or use the Platform.

2. Eligibility
• You must be at least 18 years of age to use the Platform.
• You must be legally capable of entering into binding contracts under the Indian Contract Act, 1872.
• If you are accessing the Platform on behalf of an institution (e.g., employer wellness programme), you represent that you have authority to bind that institution.
• Users residing outside India may be subject to additional local laws. By using the Platform, you confirm compliance with laws applicable in your jurisdiction.

3. Nature of Services

3.1 What We Provide
Menorah Health provides a digital men's mental health platform offering:
• Individual therapy sessions with licensed mental health professionals via audio/video
• Wellness tools including mood tracking, journaling, and psychoeducational content
• Community and peer support features (where available)
• Crisis resource information and referrals

3.2 What We Do Not Provide
The Platform is NOT a substitute for emergency mental health services. We do not provide:
• Psychiatric emergency intervention
• Inpatient or residential mental health treatment
• Prescription of medications (unless through a separately licensed psychiatrist on platform, if applicable)
• Medical diagnosis of any condition

4. Practitioner Standards
All therapists and mental health professionals on the Platform:
• Are registered with the Rehabilitation Council of India (RCI) or the relevant State Medical Council
• Have been verified by Menorah Health prior to onboarding
• Are bound by a separate Therapist/Contractor Agreement incorporating professional ethics obligations
• Are independent professionals; Menorah Health does not control the clinical content of therapeutic advice

Menorah Health is responsible for platform operations and practitioner verification, but is not liable for the specific clinical advice or decisions of individual practitioners.

5. User Obligations
By using the Platform, you agree to:
• Provide accurate, truthful information during registration and sessions
• Use the Platform only for lawful purposes
• Not record sessions without the prior written consent of the therapist
• Not share your account credentials with any other person
• Not engage in harassment, abuse, or threatening behaviour toward practitioners or other users
• Not attempt to circumvent platform security or access data of other users
• Notify us immediately at support@menorahhealth.com if you believe your account has been compromised

6. Intellectual Property
All content on the Platform — including text, graphics, logos, psychoeducational materials, software, and UX design — is the exclusive intellectual property of Menorah Health or its licensors, protected under the Copyright Act, 1957, and applicable international treaties.

You are granted a limited, non-exclusive, non-transferable, revocable licence to access and use the Platform for personal, non-commercial purposes only. You may not reproduce, distribute, modify, or create derivative works from any Platform content without our prior written consent.

7. Fees, Billing & Auto-Renewal
• Session fees and subscription prices are displayed on the Platform at the time of purchase and are inclusive of applicable GST.
• Subscription plans auto-renew at the end of each billing cycle. You may cancel auto-renewal at any time from your account settings.
• We reserve the right to modify pricing. You will be notified of price changes at least 15 days before they take effect.
• All payments are processed by PCI-DSS compliant third-party gateways. Menorah Health does not store card details.

8. Limitation of Liability
To the maximum extent permitted under applicable law:
• Menorah Health's total aggregate liability for any claim arising from use of the Platform shall not exceed the amount paid by you for services in the 3 months preceding the claim.
• We are not liable for indirect, incidental, special, punitive, or consequential damages, including loss of data or loss of opportunity.
• We are not liable for the clinical outcomes of therapy sessions conducted by independent practitioners on the Platform.

Nothing in these Terms limits liability for death or personal injury caused by negligence, fraud, or any other liability that cannot be excluded under applicable law.

9. Indemnification
You agree to indemnify and hold harmless Menorah Health, its officers, directors, employees, and agents from any claims, losses, damages, or expenses (including legal fees) arising out of: (a) your breach of these Terms; (b) your misuse of the Platform; or (c) any content you submit through the Platform that infringes the rights of a third party.

10. Termination
Menorah Health may suspend or terminate your account without notice if you breach these Terms or if we are required to do so by law. You may delete your account at any time from account settings.

Upon termination, your right to use the Platform ceases, but provisions relating to IP, liability, indemnification, and dispute resolution survive.

11. Dispute Resolution

11.1 Grievance (Consumer Protection Act, 2019)
Users may first raise a complaint with our Grievance Officer at grievance@menorahhealth.com. We will respond within 30 days.

11.2 Arbitration
Unresolved disputes shall be referred to binding arbitration under the Arbitration and Conciliation Act, 1996, with a sole arbitrator appointed by mutual agreement. The seat of arbitration shall be [City], India. The language of arbitration shall be English.

11.3 Governing Law & Jurisdiction
These Terms shall be governed by the laws of India. Subject to the arbitration clause, courts in [City], India shall have exclusive jurisdiction. International users retain the protection of mandatory consumer laws in their home jurisdiction.

12. Changes to Terms
We reserve the right to amend these Terms. Material changes will be communicated via email and in-app notification at least 15 days in advance. Continued use after the effective date constitutes acceptance of the revised Terms.`;

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

5. Safety support
In-app reporting and blocking are not currently available. Contact support from Settings if you need help with a conversation.

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

For unsafe content or behavior in chat, contact support from Settings and include the relevant conversation context in your support request.

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
