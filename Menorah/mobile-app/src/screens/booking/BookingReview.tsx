import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calendar, Clock, User, Shield, CheckCircle } from 'lucide-react-native';
import { useThemeMode } from "@/theme/ThemeProvider";
import { palettes } from "@/theme/colors";
import { api } from '@/lib/api';

// Price categories mapping
const PRICE_CATEGORIES = {
  basic: {
    title: 'Basic Session',
    price: 1000,
    duration: 45,
    features: ['General counselling', 'Email support', 'Standard session']
  },
  premium: {
    title: 'Premium Session',
    price: 2000,
    duration: 60,
    features: ['Specialized therapy', 'Priority support', 'Follow-up session', 'Extended consultation']
  },
  elite: {
    title: 'Elite Session',
    price: 5000,
    duration: 90,
    features: ['Expert therapy', '24/7 support', 'Multiple follow-ups', 'Personalized care plan', 'Premium experience']
  }
};

export default function BookingReview({ navigation, route }: any) {
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const [selectedDate, setSelectedDate] = useState<string>('tomorrow');
  const [selectedTime, setSelectedTime] = useState<string>('10:00 AM');
  const [isCreatingBooking, setIsCreatingBooking] = useState(false);
  const [loadingBooking, setLoadingBooking] = useState(false);
  const [existingBooking, setExistingBooking] = useState<any>(null);
  
  const { categoryId, gender, price, bookingId } = route.params || {};
  
  // If bookingId is provided, fetch existing booking details
  useEffect(() => {
    if (bookingId && !categoryId) {
      fetchBookingDetails();
    }
  }, [bookingId]);
  
  const fetchBookingDetails = async () => {
    if (!bookingId) return;
    
    setLoadingBooking(true);
    try {
      const response = await api.getBooking(bookingId);
      if (response.success && response.data?.booking) {
        setExistingBooking(response.data.booking);
      } else {
        Alert.alert('Error', 'Failed to load booking details. Please try again.');
        navigation.goBack();
      }
    } catch (error: any) {
      console.error('Error fetching booking:', error);
      Alert.alert('Error', 'Failed to load booking details. Please try again.');
      navigation.goBack();
    } finally {
      setLoadingBooking(false);
    }
  };
  
  // If viewing existing booking, show different UI
  if (bookingId && !categoryId) {
    if (loadingBooking) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ color: colors.text, fontSize: 16, marginTop: 16 }}>
              Loading booking details...
            </Text>
          </View>
        </SafeAreaView>
      );
    }
    
    if (!existingBooking) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
            <Text style={{ color: colors.text, fontSize: 16, textAlign: 'center' }}>
              Booking not found. Please try again.
            </Text>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={{
                backgroundColor: colors.primary,
                paddingHorizontal: 24,
                paddingVertical: 12,
                borderRadius: 8,
                marginTop: 16
              }}
            >
              <Text style={{ color: 'white', fontSize: 14, fontWeight: '600' }}>
                Go Back
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }
    
    // Render existing booking details view
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24 }}>
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 24, fontWeight: '700', color: colors.cardText, marginBottom: 8 }}>
              Booking Details
            </Text>
          </View>
          
          <View style={{
            backgroundColor: colors.card,
            borderRadius: 20,
            padding: 24,
            marginBottom: 24,
            borderWidth: 1,
            borderColor: colors.border
          }}>
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.muted, marginBottom: 4 }}>
                Status
              </Text>
              <Text style={{ fontSize: 18, fontWeight: '700', color: colors.cardText }}>
                {existingBooking.status.charAt(0).toUpperCase() + existingBooking.status.slice(1)}
              </Text>
            </View>
            
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.muted, marginBottom: 4 }}>
                Session Type
              </Text>
              <Text style={{ fontSize: 18, color: colors.cardText }}>
                {existingBooking.sessionType?.charAt(0).toUpperCase() + existingBooking.sessionType?.slice(1) || 'Video'}
              </Text>
            </View>
            
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.muted, marginBottom: 4 }}>
                Duration
              </Text>
              <Text style={{ fontSize: 18, color: colors.cardText }}>
                {existingBooking.sessionDuration || 45} minutes
              </Text>
            </View>
            
            {existingBooking.scheduledAt && (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: colors.muted, marginBottom: 4 }}>
                  Scheduled At
                </Text>
                <Text style={{ fontSize: 18, color: colors.cardText }}>
                  {new Date(existingBooking.scheduledAt).toLocaleString()}
                </Text>
              </View>
            )}
            
            {existingBooking.amount && (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: colors.muted, marginBottom: 4 }}>
                  Amount
                </Text>
                <Text style={{ fontSize: 18, color: colors.cardText }}>
                  ₹{existingBooking.amount}
                </Text>
              </View>
            )}
          </View>
          
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{
              backgroundColor: colors.primary,
              paddingVertical: 16,
              borderRadius: 12,
              alignItems: 'center'
            }}
          >
            <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>
              Go Back
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }
  
  // Original booking creation flow
  if (!categoryId || !gender || !price) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Text style={{ color: colors.text, fontSize: 16, textAlign: 'center' }}>
            Invalid booking parameters. Please try again.
          </Text>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{
              backgroundColor: colors.primary,
              paddingHorizontal: 24,
              paddingVertical: 12,
              borderRadius: 8,
              marginTop: 16
            }}
          >
            <Text style={{ color: 'white', fontSize: 14, fontWeight: '600' }}>
              Go Back
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const category = PRICE_CATEGORIES[categoryId as keyof typeof PRICE_CATEGORIES];
  const genderText = gender === 'male' ? 'Male' : 'Female';

  const handleConfirmBooking = () => {
    Alert.alert(
      'Confirm Booking',
      `Are you sure you want to book a ${category.title} with a ${genderText.toLowerCase()} therapist for ₹${price}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setIsCreatingBooking(true);
            try {
              // Create booking first (without counsellor - will be assigned after payment)
              const tomorrow = new Date();
              tomorrow.setDate(tomorrow.getDate() + 1);
              tomorrow.setHours(10, 0, 0, 0);
              
              // Build booking data, omitting undefined values
              const bookingData: any = {
                sessionType: 'video', // Default to video session
                sessionDuration: category.duration,
                scheduledAt: tomorrow.toISOString(),
                amount: price,
                preferences: {
                  gender: gender,
                  sessionType: categoryId,
                  categoryId: categoryId
                }
              };
              // Only include counsellorId if it has a value (not undefined)
              // Since we're not providing a counsellor, we omit it entirely
              
              const bookingResponse = await api.createBooking(bookingData);

              if (bookingResponse.success && bookingResponse.data?.booking?.id) {
                // Navigate to payment screen with bookingId
                navigation.navigate("PaymentSheet", {
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
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24 }}>
        {/* Header */}
        <View style={{ marginBottom: 24 }}>
          <Text style={{ fontSize: 24, fontWeight: '700', color: colors.cardText, marginBottom: 8 }}>
            Review Your Session
          </Text>
          <Text style={{ fontSize: 16, color: colors.muted, lineHeight: 22 }}>
            Review your session details before proceeding to payment
          </Text>
        </View>

        {/* Session Details Card */}
        <View style={{
          backgroundColor: colors.card,
          borderRadius: 20,
          padding: 24,
          marginBottom: 24,
          borderWidth: 1,
          borderColor: colors.border
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <View style={{
              backgroundColor: colors.primary + '20',
              borderRadius: 12,
              padding: 12,
              marginRight: 16
            }}>
              <User size={24} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: colors.cardText, marginBottom: 4 }}>
                {category.title}
              </Text>
              <Text style={{ fontSize: 16, color: colors.muted }}>
                {genderText} Therapist
              </Text>
            </View>
          </View>

          <View style={{ marginBottom: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Clock size={16} color={colors.muted} />
              <Text style={{ fontSize: 14, color: colors.cardText, marginLeft: 8 }}>
                {category.duration} minutes session
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Calendar size={16} color={colors.muted} />
              <Text style={{ fontSize: 14, color: colors.cardText, marginLeft: 8 }}>
                {selectedDate} at {selectedTime}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Shield size={16} color={colors.muted} />
              <Text style={{ fontSize: 14, color: colors.cardText, marginLeft: 8 }}>
                Therapist identity revealed after payment
              </Text>
            </View>
          </View>

          {/* Features */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.cardText, marginBottom: 12 }}>
              What's included:
            </Text>
            {category.features.map((feature, index) => (
              <View key={index} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <CheckCircle size={16} color={colors.primary} />
                <Text style={{ fontSize: 14, color: colors.cardText, marginLeft: 12, flex: 1 }}>
                  {feature}
                </Text>
              </View>
            ))}
          </View>

          {/* Price */}
          <View style={{
            backgroundColor: colors.primary + '10',
            borderRadius: 12,
            padding: 16,
            alignItems: 'center'
          }}>
            <Text style={{ fontSize: 14, color: colors.muted, marginBottom: 4 }}>
              Total Amount
            </Text>
            <Text style={{ fontSize: 28, fontWeight: '800', color: colors.primary }}>
              ₹{price}
            </Text>
          </View>
        </View>

        {/* Important Notice */}
        <View style={{
          backgroundColor: '#FEF3C7',
          borderRadius: 12,
          padding: 16,
          marginBottom: 24,
          borderWidth: 1,
          borderColor: '#F59E0B'
        }}>
          <Text style={{ fontSize: 14, color: '#92400E', fontWeight: '600', marginBottom: 8 }}>
            ⚠️ Important Notice
          </Text>
          <Text style={{ fontSize: 14, color: '#92400E', lineHeight: 20 }}>
            Your therapist's identity will be revealed only after successful payment. This ensures unbiased matching based on your preferences.
          </Text>
        </View>

        {/* Action Buttons */}
        <View style={{ gap: 12 }}>
          <TouchableOpacity
            onPress={handleConfirmBooking}
            disabled={isCreatingBooking}
            style={{
              backgroundColor: isCreatingBooking ? colors.muted : colors.primary,
              paddingVertical: 16,
              borderRadius: 12,
              alignItems: 'center',
              opacity: isCreatingBooking ? 0.6 : 1,
            }}
          >
            {isCreatingBooking ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <ActivityIndicator size="small" color="white" style={{ marginRight: 8 }} />
                <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>
                  Creating Booking...
                </Text>
              </View>
            ) : (
              <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>
                Confirm & Proceed to Payment
              </Text>
            )}
          </TouchableOpacity>
          
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{
              backgroundColor: 'transparent',
              paddingVertical: 16,
              borderRadius: 12,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: colors.border
            }}
          >
            <Text style={{ color: colors.cardText, fontSize: 16, fontWeight: '600' }}>
              Back to Selection
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
