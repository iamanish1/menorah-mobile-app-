import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, Dimensions, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Star, MessageCircle, Calendar, MapPin, Clock, Phone, Video, Heart, Share2, Award, Users } from 'lucide-react-native';
import { useThemeMode } from "@/theme/ThemeProvider";
import { palettes, headerGradient } from "@/theme/colors";
import { api, Counsellor } from "@/lib/api";
import Button from "@/components/ui/Button";

const { width } = Dimensions.get('window');

export default function CounsellorProfile({ navigation, route }: any) {
  const { counsellorId } = route.params || {};
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const [counsellor, setCounsellor] = useState<Counsellor | null>(null);
  const [loading, setLoading] = useState(true);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [timeSlots, setTimeSlots] = useState<any[]>([]);
  const [isFavorite, setIsFavorite] = useState(false);

  useEffect(() => {
    if (counsellorId) {
      loadCounsellor();
    }
  }, [counsellorId]);

  const loadCounsellor = async () => {
    setLoading(true);
    try {
      const response = await api.getCounsellor(counsellorId);
      
      if (response.success && response.data) {
        setCounsellor(response.data.counsellor);
        // Load availability for today
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 7);
        
        loadAvailability(today.toISOString(), tomorrow.toISOString());
      } else {
        Alert.alert('Error', 'Failed to load counsellor profile. Please try again.');
        navigation.goBack();
      }
    } catch (error: any) {
      console.error('Error loading counsellor:', error);
      Alert.alert('Error', 'Failed to load counsellor profile. Please try again.');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const loadAvailability = async (startDate: string, endDate: string) => {
    if (!counsellorId) return;
    
    setAvailabilityLoading(true);
    try {
      const response = await api.getCounsellorAvailability(counsellorId, startDate, endDate);
      
      if (response.success && response.data) {
        // Format availability data into time slots
        const slots = formatAvailability(response.data.availability || []);
        setTimeSlots(slots);
      }
    } catch (error: any) {
      console.error('Error loading availability:', error);
    } finally {
      setAvailabilityLoading(false);
    }
  };

  const formatAvailability = (availability: any[]) => {
    // Format availability data into time slots for display
    // This depends on your backend's availability format
    const slots: any[] = [];
    
    availability.forEach((slot: any) => {
      if (slot.startTime && slot.available) {
        const date = new Date(slot.startTime);
        slots.push({
          id: slot.id || date.getTime().toString(),
          time: date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
          date: date.toISOString(),
          available: slot.available,
          slot: slot
        });
      }
    });
    
    return slots;
  };

  const handleBookSession = () => {
    if (!selectedSlot || !selectedDate) {
      Alert.alert('Select Time', 'Please select a time slot to book your session.');
      return;
    }

    const selectedSlotData = timeSlots.find(s => s.id === selectedSlot);
    if (!selectedSlotData) return;

    navigation.navigate('BookingReview', {
      counsellorId: counsellor?.id,
      counsellorName: counsellor?.name,
      sessionType: 'video', // Default to video
      sessionDuration: counsellor?.sessionDuration || 60,
      scheduledAt: selectedSlotData.date,
      hourlyRate: counsellor?.hourlyRate || 0,
      currency: counsellor?.currency || 'INR'
    });
  };

  const renderTimeSlot = ({ item }: { item: any }) => (
    <TouchableOpacity
      onPress={() => {
        if (item.available) {
          setSelectedSlot(item.id);
          setSelectedDate(item.date);
        }
      }}
      style={{
        backgroundColor: item.available 
          ? (selectedSlot === item.id ? colors.primary : colors.card)
          : colors.surface,
        borderWidth: 1,
        borderColor: item.available ? colors.border : colors.border,
        borderRadius: 12,
        padding: 16,
        marginRight: 12,
        marginBottom: 12,
        opacity: item.available ? 1 : 0.5,
        minWidth: (width - 64) / 3,
        alignItems: 'center',
        shadowColor: colors.text,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2
      }}
      disabled={!item.available}
    >
      <Text style={{
        fontSize: 14,
        fontWeight: '600',
        color: item.available 
          ? (selectedSlot === item.id ? 'white' : colors.cardText)
          : colors.muted
      }}>
        {item.time}
      </Text>
    </TouchableOpacity>
  );

  const renderSection = ({ item }: { item: any }) => {
    switch (item.type) {
      case 'header':
        return (
          <LinearGradient
            colors={headerGradient(scheme) as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ paddingBottom: 20 }}
          >
            {/* Top Bar */}
            <View style={{ 
              flexDirection: 'row', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              paddingVertical: 12
            }}>
              <TouchableOpacity
                onPress={() => navigation.goBack()}
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.2)',
                  borderRadius: 20,
                  padding: 8
                }}
              >
                <ArrowLeft size={20} color="white" />
              </TouchableOpacity>
              
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  onPress={() => setIsFavorite(!isFavorite)}
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    borderRadius: 20,
                    padding: 8
                  }}
                >
                  <Heart size={20} color={isFavorite ? '#EF4444' : 'white'} fill={isFavorite ? '#EF4444' : 'none'} />
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    borderRadius: 20,
                    padding: 8
                  }}
                >
                  <Share2 size={20} color="white" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Profile Info */}
            {loading ? (
              <View style={{ paddingHorizontal: 16, alignItems: 'center', paddingVertical: 40 }}>
                <ActivityIndicator size="large" color="white" />
              </View>
            ) : counsellor ? (
              <View style={{ paddingHorizontal: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                  {counsellor.profileImage ? (
                    <Image
                      source={{ uri: counsellor.profileImage }}
                      style={{ width: 80, height: 80, borderRadius: 40, marginRight: 16 }}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={{
                      width: 80,
                      height: 80,
                      borderRadius: 40,
                      backgroundColor: 'rgba(255, 255, 255, 0.2)',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 16
                    }}>
                      <Users size={40} color="white" />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                      <Text style={{ fontSize: 20, fontWeight: '700', color: 'white', marginRight: 8 }}>
                        {counsellor.name}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 14, color: 'rgba(255, 255, 255, 0.8)', marginBottom: 4 }}>
                      {counsellor.specialization || 'Counsellor'}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Star size={14} color="#FFD700" fill="#FFD700" />
                      <Text style={{ fontSize: 14, color: 'white', marginLeft: 4 }}>
                        {counsellor.rating?.toFixed(1) || '0.0'} ({counsellor.reviewCount || 0} reviews)
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Quick Stats */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16 }}>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: 'white' }}>
                      {counsellor.currency === 'INR' ? '₹' : '$'}{counsellor.hourlyRate || 0}
                    </Text>
                    <Text style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.8)' }}>
                      per session
                    </Text>
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: 'white' }}>
                      {counsellor.totalSessions || 0}+
                    </Text>
                    <Text style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.8)' }}>
                      sessions
                    </Text>
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: 'white' }}>
                      {counsellor.experience || 0}+
                    </Text>
                    <Text style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.8)' }}>
                      years exp
                    </Text>
                  </View>
                </View>

                {/* Quick Actions */}
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity
                    onPress={() => navigation.navigate("ChatThread", { counsellorId: counsellor.id })}
                    style={{
                      flex: 1,
                      backgroundColor: 'rgba(255, 255, 255, 0.2)',
                      borderRadius: 12,
                      padding: 12,
                      alignItems: 'center',
                      flexDirection: 'row',
                      justifyContent: 'center'
                    }}
                  >
                    <MessageCircle size={16} color="white" />
                    <Text style={{ color: 'white', fontSize: 14, fontWeight: '600', marginLeft: 6 }}>
                      Message
                    </Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    onPress={handleBookSession}
                    style={{
                      flex: 1,
                      backgroundColor: 'white',
                      borderRadius: 12,
                      padding: 12,
                      alignItems: 'center',
                      flexDirection: 'row',
                      justifyContent: 'center'
                    }}
                  >
                    <Calendar size={16} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '600', marginLeft: 6 }}>
                      Book Session
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
          </LinearGradient>
        );
      
      case 'about':
        return (
          <View style={{ paddingHorizontal: 16, marginBottom: 20 }}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 16 }}>
              About
            </Text>
            <Text style={{ fontSize: 14, color: colors.text, lineHeight: 22 }}>
              {counsellor?.bio || 'No bio available'}
            </Text>
          </View>
        );
      
      case 'specializations':
        return (
          <View style={{ paddingHorizontal: 16, marginBottom: 20 }}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 16 }}>
              Specializations
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {(counsellor?.specializations || []).map((spec, index) => (
                <View
                  key={index}
                  style={{
                    backgroundColor: colors.primary + '15',
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderRadius: 20,
                    borderWidth: 1,
                    borderColor: colors.primary + '30'
                  }}
                >
                  <Text style={{ fontSize: 14, color: colors.primary, fontWeight: '600' }}>
                    {spec}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        );
      
      case 'timeSlots':
        return (
          <View style={{ paddingHorizontal: 16, marginBottom: 20 }}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 16 }}>
              Available Time Slots
            </Text>
            {availabilityLoading ? (
              <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={{ fontSize: 14, color: colors.muted, marginTop: 8 }}>
                  Loading availability...
                </Text>
              </View>
            ) : timeSlots.length > 0 ? (
              <FlatList
                data={timeSlots}
                renderItem={renderTimeSlot}
                keyExtractor={(item) => item.id.toString()}
                horizontal={false}
                numColumns={3}
                showsHorizontalScrollIndicator={false}
                scrollEnabled={false}
                contentContainerStyle={{ paddingBottom: 20 }}
              />
            ) : (
              <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                <Text style={{ fontSize: 14, color: colors.muted, textAlign: 'center' }}>
                  No available time slots at the moment. Please check back later.
                </Text>
              </View>
            )}
          </View>
        );
      
      default:
        return null;
    }
  };

  const sections = [
    { id: 'header', type: 'header' },
    { id: 'about', type: 'about' },
    { id: 'specializations', type: 'specializations' },
    { id: 'timeSlots', type: 'timeSlots' }
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={sections}
        renderItem={renderSection}
        keyExtractor={(item) => item.id}
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
      />

      {/* Bottom Action */}
      {loading ? (
        <View style={{
          backgroundColor: colors.card,
          paddingHorizontal: 16,
          paddingVertical: 16,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          alignItems: 'center'
        }}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : counsellor ? (
        <View style={{
          backgroundColor: colors.card,
          paddingHorizontal: 16,
          paddingVertical: 16,
          borderTopWidth: 1,
          borderTopColor: colors.border
        }}>
          <TouchableOpacity
            onPress={handleBookSession}
            disabled={!selectedSlot}
            style={{
              backgroundColor: selectedSlot ? colors.primary : colors.muted,
              borderRadius: 12,
              padding: 16,
              alignItems: 'center'
            }}
          >
            <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>
              {selectedSlot 
                ? `Book Session - ${counsellor.currency === 'INR' ? '₹' : '$'}${counsellor.hourlyRate || 0}`
                : 'Select a time slot to book'
              }
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
