import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Clock, Calendar, Shield, Check, AlertTriangle } from 'lucide-react-native';
import { useThemeMode } from '@/theme/ThemeProvider';
import { palettes } from '@/theme/colors';
import { api } from '@/lib/api';
import type { SessionType, TherapistGender } from '@/components/discover/SessionTypeSelector';

interface SessionReviewProps {
  navigation: any;
  route: {
    params: {
      sessionType: SessionType;
      gender: TherapistGender;
      duration: number;
      price: number;
      features: string[];
    };
  };
}

const SESSION_DETAILS = {
  basic: {
    title: 'Basic Session',
    icon: '👤',
    color: '#10B981'
  },
  premium: {
    title: 'Premium Session',
    icon: '👥',
    color: '#3B82F6'
  },
  pro: {
    title: 'Pro Session',
    icon: '👑',
    color: '#8B5CF6'
  }
};

export default function SessionReview({ navigation, route }: SessionReviewProps) {
  const { sessionType, gender, duration, price, features } = route.params;
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const [isCreatingBooking, setIsCreatingBooking] = useState(false);
  
  const sessionInfo = SESSION_DETAILS[sessionType];
  const genderText = gender === 'male' ? 'Male Therapist' : 'Female Therapist';

  const handlePayment = async () => {
    setIsCreatingBooking(true);
    try {
      // Create booking first (without counsellor - will be assigned after payment)
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(10, 0, 0, 0);
      
      // Build booking data, omitting undefined values
      const bookingData: any = {
        sessionType: 'video', // Default to video session
        sessionDuration: duration,
        scheduledAt: tomorrow.toISOString(),
        amount: price,
        preferences: {
          gender: gender,
          sessionType: sessionType,
          categoryId: sessionType
        }
      };
      // Only include counsellorId if it has a value (not undefined)
      // Since we're not providing a counsellor, we omit it entirely
      
      const bookingResponse = await api.createBooking(bookingData);

      if (bookingResponse.success && bookingResponse.data?.booking?.id) {
        // Navigate to payment screen with bookingId
        navigation.navigate('PaymentSheet', {
          bookingId: bookingResponse.data.booking.id,
          paymentMethod: 'razorpay'
        });
      } else {
        Alert.alert('Error', bookingResponse.message || 'Failed to create booking. Please try again.');
      }
    } catch (error: any) {
      console.error('Error creating booking:', error);
      Alert.alert('Error', 'Failed to create booking. Please try again.');
    } finally {
      setIsCreatingBooking(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header with dark green background */}
      <View style={{ backgroundColor: '#314830', paddingBottom: 16, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }}>
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
              <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>
                Review your session details before proceeding to payment
              </Text>
            </View>
          </View>
        </SafeAreaView>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
        {/* Main Session Card */}
        <View style={{ 
          backgroundColor: colors.card, 
          margin: 16, 
          borderRadius: 20, 
          padding: 20,
          borderWidth: 1,
          borderColor: colors.border,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 3,
        }}>
          {/* Session Type and Therapist */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
            <View style={{
              backgroundColor: colors.bg,
              width: 60,
              height: 60,
              borderRadius: 16,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 16
            }}>
              <Text style={{ fontSize: 24 }}>{sessionInfo.icon}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ 
                fontSize: 24, 
                fontWeight: '700', 
                color: '#151a16', 
                marginBottom: 4 
              }}>
                {sessionInfo.title}
              </Text>
              <Text style={{ 
                fontSize: 16, 
                color: '#6b7280' 
              }}>
                {genderText}
              </Text>
            </View>
          </View>

          {/* Session Details */}
          <View style={{ marginBottom: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Clock size={20} color={colors.primary} style={{ marginRight: 12 }} />
              <Text style={{ fontSize: 16, color: '#151a16' }}>
                {duration} minutes session
              </Text>
            </View>
            
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Calendar size={20} color={colors.primary} style={{ marginRight: 12 }} />
              <Text style={{ fontSize: 16, color: '#151a16' }}>
                tomorrow at 10:00 AM
              </Text>
            </View>
            
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Shield size={20} color={colors.primary} style={{ marginRight: 12 }} />
              <Text style={{ fontSize: 16, color: '#151a16' }}>
                Therapist identity revealed after payment
              </Text>
            </View>
          </View>

          {/* What's included */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ 
              fontSize: 18, 
              fontWeight: '700', 
              color: '#151a16', 
              marginBottom: 12 
            }}>
              What's included:
            </Text>
            {features.map((feature, index) => (
              <View key={index} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <Check size={16} color={colors.primary} style={{ marginRight: 12 }} />
                <Text style={{ fontSize: 14, color: '#151a16' }}>
                  {feature}
                </Text>
              </View>
            ))}
          </View>

          {/* Total Amount */}
          <View style={{ 
            borderTopWidth: 1, 
            borderTopColor: colors.border, 
            paddingTop: 16 
          }}>
            <Text style={{ 
              fontSize: 16, 
              color: '#6b7280', 
              marginBottom: 8 
            }}>
              Total Amount
            </Text>
            <Text style={{ 
              fontSize: 28, 
              fontWeight: '700', 
              color: sessionInfo.color 
            }}>
              ₹{price}
            </Text>
          </View>
        </View>

        {/* Important Notice */}
        <View style={{ 
          backgroundColor: '#FEF3C7', 
          margin: 16, 
          marginTop: 0,
          borderRadius: 12, 
          padding: 16,
          borderWidth: 1,
          borderColor: '#F59E0B'
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <AlertTriangle size={20} color="#F59E0B" style={{ marginRight: 12, marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ 
                fontSize: 16, 
                fontWeight: '700', 
                color: '#92400E',
                marginBottom: 4
              }}>
                Important Notice
              </Text>
              <Text style={{ 
                fontSize: 14, 
                color: '#92400E',
                lineHeight: 20
              }}>
                Your therapist's identity will be revealed only after successful payment for unbiased matching.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Payment Button */}
      <View style={{ 
        padding: 16, 
        backgroundColor: colors.card,
        borderTopWidth: 1,
        borderTopColor: colors.border
      }}>
        <TouchableOpacity
          onPress={handlePayment}
          disabled={isCreatingBooking}
          style={{
            backgroundColor: isCreatingBooking ? colors.muted : sessionInfo.color,
            borderRadius: 12,
            paddingVertical: 16,
            alignItems: 'center',
            shadowColor: sessionInfo.color,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 4,
            opacity: isCreatingBooking ? 0.6 : 1,
          }}
        >
          {isCreatingBooking ? (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <ActivityIndicator size="small" color="white" style={{ marginRight: 8 }} />
              <Text style={{
                color: 'white',
                fontSize: 18,
                fontWeight: '700'
              }}>
                Creating Booking...
              </Text>
            </View>
          ) : (
            <Text style={{
              color: 'white',
              fontSize: 18,
              fontWeight: '700'
            }}>
              Proceed to Payment - ₹{price}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}
