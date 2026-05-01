import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { User, ArrowLeft } from 'lucide-react-native';
import { useThemeMode } from '@/theme/ThemeProvider';
import { palettes } from '@/theme/colors';
import type { SessionType, TherapistGender } from '@/components/discover/SessionTypeSelector';

interface GenderSelectionProps {
  navigation: any;
  route: {
    params?: {
      sessionType: SessionType;
      duration: number;
      price: number;
    };
  };
}

const GENDER_OPTIONS = [
  {
    id: 'male' as TherapistGender,
    title: 'Male Therapist',
    description: 'Experienced male counsellors',
    icon: User,
    color: '#3B82F6',
    bgColor: '#DBEAFE',
  },
];

const SESSION_DETAILS = {
  basic: {
    title: 'Basic Session',
    duration: 45,
    price: 1000,
    features: ['General counselling', 'Email support', 'Standard session']
  },
  premium: {
    title: 'Premium Session',
    duration: 60,
    price: 2000,
    features: ['Enhanced counselling', 'Priority support', 'Extended session', 'Follow-up call']
  },
  pro: {
    title: 'Pro Session',
    duration: 90,
    price: 3000,
    features: ['Comprehensive counselling', '24/7 support', 'Extended session', 'Multiple follow-ups', 'Resource materials']
  }
};

export default function GenderSelection({ navigation, route }: GenderSelectionProps) {
  const fallbackSessionType: SessionType = 'basic';
  const routeParams = route?.params;
  const sessionType = routeParams?.sessionType ?? fallbackSessionType;
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const [selectedGender, setSelectedGender] = useState<TherapistGender | null>(null);

  const sessionDetails = SESSION_DETAILS[sessionType];

  const handleGenderSelect = (gender: TherapistGender) => {
    setSelectedGender(gender);
    // Navigate to session review with all details
    navigation.navigate('SessionReview', {
      sessionType,
      gender,
      duration: sessionDetails.duration,
      price: sessionDetails.price,
      features: sessionDetails.features
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header with dark green background */}
      <View style={{ backgroundColor: '#314830', paddingBottom: 16 }}>
        <SafeAreaView>
          <View style={{ 
            flexDirection: 'row', 
            alignItems: 'center', 
            paddingHorizontal: 16,
            paddingTop: 8
          }}>
            <TouchableOpacity 
              onPress={() => navigation.goBack()}
              style={{ marginRight: 16 }}
            >
              <ArrowLeft size={24} color="white" />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={{ color: 'white', fontSize: 22, fontWeight: '600' }}>
                Choose Your Preference
              </Text>
              <Text style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: 14, marginTop: 4 }}>
                Select your preferred therapist gender
              </Text>
            </View>
          </View>
        </SafeAreaView>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
        {/* Session Type Info */}
        <View style={{ 
          backgroundColor: colors.card, 
          margin: 16, 
          borderRadius: 16, 
          padding: 16,
          borderWidth: 1,
          borderColor: colors.border
        }}>
          <Text style={{ 
            fontSize: 18, 
            fontWeight: '700', 
            color: '#151a16', 
            marginBottom: 8 
          }}>
            Selected Session: {sessionDetails.title}
          </Text>
          <Text style={{ 
            fontSize: 14, 
            color: '#6b7280', 
            marginBottom: 4 
          }}>
            Duration: {sessionDetails.duration} minutes
          </Text>
          <Text style={{ 
            fontSize: 16, 
            fontWeight: '600', 
            color: colors.primary 
          }}>
            Price: ₹{sessionDetails.price}
          </Text>
        </View>

        {/* Gender Selection */}
        <View style={{ paddingHorizontal: 16 }}>
          <Text style={{
            fontSize: 20,
            fontWeight: '700',
            color: colors.text,
            marginBottom: 16
          }}>
            Choose Your Preference
          </Text>

          <View style={{ alignItems: 'center' }}>
            {GENDER_OPTIONS.map((gender) => {
              const IconComponent = gender.icon;
              const isSelected = selectedGender === gender.id;
              
              return (
                <TouchableOpacity
                  key={gender.id}
                  onPress={() => handleGenderSelect(gender.id)}
                  style={{
                    width: '100%',
                    maxWidth: 400,
                    backgroundColor: colors.card,
                    borderRadius: 20,
                    padding: 24,
                    borderWidth: isSelected ? 2 : 1,
                    borderColor: isSelected ? gender.color : colors.border,
                    shadowColor: isSelected ? gender.color : '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: isSelected ? 0.1 : 0.05,
                    shadowRadius: 4,
                    elevation: isSelected ? 3 : 1,
                  }}
                >
                  <View style={{
                    backgroundColor: gender.bgColor,
                    width: 80,
                    height: 80,
                    borderRadius: 40,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 20,
                    alignSelf: 'center'
                  }}>
                    <IconComponent size={40} color={gender.color} />
                  </View>
                  
                  <Text style={{
                    fontSize: 20,
                    fontWeight: '700',
                    color: '#151a16',
                    marginBottom: 8,
                    textAlign: 'center'
                  }}>
                    {gender.title}
                  </Text>
                  
                  <Text style={{
                    fontSize: 15,
                    color: '#6b7280',
                    textAlign: 'center',
                    lineHeight: 22
                  }}>
                    {gender.description}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
