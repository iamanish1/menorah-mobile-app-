import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Calendar, Clock, MapPin, User, Image as ImageIcon } from "lucide-react-native";
import { Image } from "expo-image";
import { useThemeMode } from "@/theme/ThemeProvider";
import { palettes } from "@/theme/colors";
import { api, Booking } from "@/lib/api";
import { socketService } from "@/lib/socket";

export default function Bookings({ navigation }: any) {
  const [activeTab, setActiveTab] = useState<'upcoming' | 'completed'>('upcoming');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];

  useEffect(() => {
    fetchBookings();
  }, [activeTab]);

  // Refresh list when counsellor confirms or reschedules
  useEffect(() => {
    const unsub1 = socketService.onBookingConfirmed(() => fetchBookings());
    const unsub2 = socketService.onBookingRescheduled(() => fetchBookings());
    return () => { unsub1(); unsub2(); };
  }, [activeTab]);

  const fetchBookings = async () => {
    setLoading(true);
    try {
      const status = activeTab === 'upcoming' ? 'pending,confirmed' : 'completed';
      const response = await api.getBookings({ status, page: 1, limit: 50 });
      
      if (response.success && response.data) {
        setBookings(response.data.bookings || []);
      } else {
        console.error('Failed to fetch bookings:', response.message);
        setBookings([]);
      }
    } catch (error: any) {
      console.error('Error fetching bookings:', error);
      Alert.alert('Error', 'Failed to load bookings. Please try again.');
      setBookings([]);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchBookings();
    setRefreshing(false);
  };

  const handleBookSession = () => {
    navigation.navigate('GenderSelection');
  };

  const formatBookingDate = (booking: Booking) => {
    // Use createdAt (when booking was created/paid) to get the day of month
    const bookingDate = booking.createdAt ? new Date(booking.createdAt) : new Date(booking.scheduledAt);
    return bookingDate.getDate(); // Returns day of month (1-31)
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed':
      case 'pending':
        return colors.primary;
      case 'completed':
        return '#10B981';
      case 'cancelled':
        return '#EF4444';
      case 'in-progress':
        return '#F59E0B';
      default:
        return colors.muted;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'Upcoming';
      case 'pending':
        return 'Pending';
      case 'completed':
        return 'Completed';
      case 'cancelled':
        return 'Cancelled';
      case 'in-progress':
        return 'In Progress';
      default:
        return status;
    }
  };

  const upcomingBookings = bookings.filter(b => b.status === 'confirmed' || b.status === 'pending' || b.status === 'in-progress');
  const completedBookings = bookings.filter(b => b.status === 'completed');

  const handleJoinSession = async (booking: Booking) => {
    try {
      if (booking.sessionType === 'video') {
        // Navigate to video call screen
        navigation.navigate('PreCallCheck', { bookingId: booking.id });
      } else if (booking.sessionType === 'audio') {
        // Handle audio call
        Alert.alert('Audio Call', 'Audio call feature coming soon');
      } else {
        // Navigate to chat
        navigation.navigate('ChatThread', { roomId: booking.id });
      }
    } catch (error) {
      console.error('Error joining session:', error);
      Alert.alert('Error', 'Failed to join session. Please try again.');
    }
  };

  const renderBookingCard = (booking: Booking) => (
    <TouchableOpacity
      key={booking.id}
      onPress={() => navigation.navigate('BookingReview', { bookingId: booking.id })}
      style={{
        backgroundColor: colors.card,
        borderRadius: 20,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: colors.border
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        {booking.counsellorImage ? (
          <Image
            source={{ uri: booking.counsellorImage }}
            style={{ width: 40, height: 40, borderRadius: 20, marginRight: 12 }}
            contentFit="cover"
          />
        ) : (
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary + '20', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
            <User size={20} color={colors.primary} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: colors.cardText }}>
            Counsellor
          </Text>
          <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
            {booking.specialization}
          </Text>
        </View>
      </View>
      
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <Calendar size={16} color={colors.muted} />
        <Text style={{ fontSize: 14, color: colors.cardText, marginLeft: 8 }}>
          {formatBookingDate(booking)}
        </Text>
      </View>
      
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <Clock size={16} color={colors.muted} />
        <Text style={{ fontSize: 14, color: colors.cardText, marginLeft: 8 }}>
          Booked instant session
        </Text>
      </View>
      
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <MapPin size={16} color={colors.muted} />
        <Text style={{ fontSize: 14, color: colors.cardText, marginLeft: 8 }}>
          Online • {booking.sessionType.charAt(0).toUpperCase() + booking.sessionType.slice(1)}
        </Text>
      </View>
      
      <View style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <View style={{
          backgroundColor: getStatusColor(booking.status) + '20',
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 12
        }}>
          <Text style={{
            fontSize: 12,
            fontWeight: '600',
            color: getStatusColor(booking.status)
          }}>
            {getStatusLabel(booking.status)}
          </Text>
        </View>
        
        {booking.status === 'in-progress' && (
          <TouchableOpacity
            onPress={() => handleJoinSession(booking)}
            style={{
              backgroundColor: colors.primary,
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderRadius: 12
            }}
          >
            <Text style={{ color: 'white', fontSize: 14, fontWeight: '600' }}>Join Now</Text>
          </TouchableOpacity>
        )}
        {booking.status === 'confirmed' && (
          <TouchableOpacity
            onPress={() => handleJoinSession(booking)}
            style={{
              backgroundColor: '#F59E0B',
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderRadius: 12
            }}
          >
            <Text style={{ color: 'white', fontSize: 14, fontWeight: '600' }}>Wait / Ready</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header */}
      <View style={{
        backgroundColor: colors.card,
        paddingHorizontal: 16,
        paddingVertical: 20,
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24
      }}>
        <Text style={{ fontSize: 24, fontWeight: '700', color: colors.cardText, marginBottom: 16 }}>
          My Bookings
        </Text>
        
        {/* Tab Buttons */}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <TouchableOpacity
            onPress={() => setActiveTab('upcoming')}
            style={{
              flex: 1,
              backgroundColor: activeTab === 'upcoming' ? colors.primary : colors.surface,
              paddingVertical: 12,
              borderRadius: 16,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: activeTab === 'upcoming' ? colors.primary : colors.border
            }}
          >
            <Text style={{
              fontSize: 16,
              fontWeight: '600',
              color: activeTab === 'upcoming' ? 'white' : colors.cardText
            }}>
              Upcoming
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            onPress={() => setActiveTab('completed')}
            style={{
              flex: 1,
              backgroundColor: activeTab === 'completed' ? colors.primary : colors.surface,
              paddingVertical: 12,
              borderRadius: 16,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: activeTab === 'completed' ? colors.primary : colors.border
            }}
          >
            <Text style={{
              fontSize: 16,
              fontWeight: '600',
              color: activeTab === 'completed' ? 'white' : colors.cardText
            }}>
              Completed
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Content */}
      <ScrollView 
        style={{ flex: 1 }} 
        contentContainerStyle={{ padding: 16 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {loading ? (
          <View style={{ alignItems: 'center', marginTop: 40 }}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : activeTab === 'upcoming' ? (
          upcomingBookings.length > 0 ? (
            upcomingBookings.map(renderBookingCard)
          ) : (
            <View style={{ alignItems: 'center', marginTop: 40 }}>
              <Calendar size={48} color={colors.muted} />
              <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text, marginTop: 16 }}>
                No upcoming bookings
              </Text>
              <Text style={{ fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 8 }}>
                Book your first session to get started
              </Text>
              <TouchableOpacity
                onPress={handleBookSession}
                style={{
                  backgroundColor: colors.primary,
                  paddingHorizontal: 24,
                  paddingVertical: 12,
                  borderRadius: 16,
                  marginTop: 24,
                  minWidth: 170,
                  alignItems: 'center'
                }}
              >
                <Text style={{ color: 'white', fontSize: 15, fontWeight: '600' }}>
                  Book Session
                </Text>
              </TouchableOpacity>
            </View>
          )
        ) : (
          completedBookings.length > 0 ? (
            completedBookings.map(renderBookingCard)
          ) : (
            <View style={{ alignItems: 'center', marginTop: 40 }}>
              <Calendar size={48} color={colors.muted} />
              <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text, marginTop: 16 }}>
                No completed sessions
              </Text>
              <Text style={{ fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 8 }}>
                Your completed sessions will appear here
              </Text>
            </View>
          )
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
