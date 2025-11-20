import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Alert, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { MessageCircle, Clock, Plus, X } from "lucide-react-native";
import { useThemeMode } from "@/theme/ThemeProvider";
import { palettes } from "@/theme/colors";
import { useChat } from "@/state/useChat";
import { api } from "@/lib/api";
import { ChatRoom } from "@/lib/api";

export default function ChatList({ navigation }: any) {
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const { chatRooms, fetchChatRooms, isConnected } = useChat();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showAvailableCounsellors, setShowAvailableCounsellors] = useState(false);
  const [availableCounsellors, setAvailableCounsellors] = useState<any[]>([]);
  const [loadingCounsellors, setLoadingCounsellors] = useState(false);

  useEffect(() => {
    loadChatRooms();
  }, []);

  const loadChatRooms = async () => {
    setLoading(true);
    try {
      await fetchChatRooms();
    } catch (error) {
      console.error('Error loading chat rooms:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchChatRooms();
    setRefreshing(false);
  };

  const loadAvailableCounsellors = async () => {
    setLoadingCounsellors(true);
    try {
      const response = await api.getAvailableCounsellors();
      console.log('Available counselors response:', response);
      if (response.success && response.data) {
        const counsellors = response.data.counsellors || [];
        console.log(`Found ${counsellors.length} available counselors`);
        setAvailableCounsellors(counsellors);
        setShowAvailableCounsellors(true);
        
        if (counsellors.length === 0) {
          Alert.alert(
            'No Counselors Available',
            'There are no counselors available for chat at the moment. Please try again later.',
            [{ text: 'OK' }]
          );
        }
      } else {
        console.error('Failed to load counselors:', response);
        Alert.alert('Error', response.message || 'Failed to load available counselors');
      }
    } catch (error: any) {
      console.error('Error loading available counselors:', error);
      Alert.alert('Error', error.message || 'Failed to load available counselors. Please try again.');
    } finally {
      setLoadingCounsellors(false);
    }
  };

  const handleStartChat = async (counsellorId: string, counsellorName: string) => {
    try {
      const response = await api.startChat(counsellorId);
      if (response.success && response.data) {
        const room = response.data.room;
        setShowAvailableCounsellors(false);
        // Refresh chat rooms
        await fetchChatRooms();
        // Navigate to the chat thread
        navigation.navigate('ChatThread', {
          roomId: room.roomId || room.id,
          counsellorUserId: room.counsellorUserId || room.counsellorId,
          counsellorName: room.counsellorName || counsellorName,
          counsellorImage: room.counsellorImage
        });
      } else {
        Alert.alert('Error', response.message || 'Failed to start chat');
      }
    } catch (error: any) {
      console.error('Error starting chat:', error);
      Alert.alert('Error', 'Failed to start chat. Please try again.');
    }
  };

  const formatTimestamp = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diff = now.getTime() - date.getTime();
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      
      if (days === 0) {
        return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      } else if (days === 1) {
        return 'Yesterday';
      } else if (days < 7) {
        return `${days} days ago`;
      } else {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }
    } catch {
      return timestamp;
    }
  };

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
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={{ fontSize: 24, fontWeight: '700', color: colors.cardText }}>
              Messages
            </Text>
            <Text style={{ fontSize: 14, color: colors.muted, marginTop: 4 }}>
              Chat with your counsellors
            </Text>
          </View>
          <TouchableOpacity
            onPress={loadAvailableCounsellors}
            style={{
              backgroundColor: colors.primary,
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Plus size={24} color="white" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Chat List */}
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
        ) : chatRooms.length > 0 ? (
          chatRooms.map((chat: ChatRoom) => (
            <TouchableOpacity
              key={chat.id}
              onPress={() => navigation.navigate("ChatThread", { 
                roomId: chat.id,
                counsellorUserId: chat.counsellorUserId,
                counsellorName: chat.counsellorName,
                counsellorImage: chat.counsellorImage
              })}
              style={{
                backgroundColor: colors.card,
                borderRadius: 20,
                padding: 16,
                marginBottom: 12,
                borderWidth: 1,
                borderColor: colors.border
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ position: 'relative' }}>
                  {chat.counsellorImage ? (
                    <Image
                      source={{ uri: chat.counsellorImage }}
                      style={{ width: 50, height: 50, borderRadius: 25 }}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={{
                      width: 50,
                      height: 50,
                      borderRadius: 25,
                      backgroundColor: colors.primary + '20',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <MessageCircle size={24} color={colors.primary} />
                    </View>
                  )}
                  {chat.isOnline && (
                    <View style={{
                      position: 'absolute',
                      bottom: 2,
                      right: 2,
                      width: 12,
                      height: 12,
                      borderRadius: 6,
                      backgroundColor: '#10B981',
                      borderWidth: 2,
                      borderColor: colors.card
                    }} />
                  )}
                </View>
                
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: colors.cardText }}>
                      {chat.counsellorName && chat.counsellorName !== 'undefined undefined' ? chat.counsellorName : 'Counsellor'}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Clock size={12} color={colors.muted} />
                      <Text style={{ fontSize: 12, color: colors.muted, marginLeft: 4 }}>
                        {formatTimestamp(chat.lastMessageTime)}
                      </Text>
                    </View>
                  </View>
                  
                  <Text style={{ fontSize: 14, color: colors.muted, marginBottom: 4 }} numberOfLines={1}>
                    {chat.lastMessage || 'No messages yet'}
                  </Text>
                </View>
                
                {chat.unreadCount > 0 && (
                  <View style={{
                    backgroundColor: colors.primary,
                    borderRadius: 16,
                    minWidth: 20,
                    height: 20,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginLeft: 8,
                    paddingHorizontal: 6
                  }}>
                    <Text style={{ color: 'white', fontSize: 12, fontWeight: '600' }}>
                      {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                    </Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          ))
        ) : (
          <View style={{ alignItems: 'center', marginTop: 40 }}>
            <MessageCircle size={48} color={colors.muted} />
            <Text style={{ fontSize: 18, fontWeight: '600', color: colors.cardText, marginTop: 16 }}>
              No messages yet
            </Text>
            <Text style={{ fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 8 }}>
              Start a conversation with your counsellor
            </Text>
            {!isConnected && (
              <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: 8, fontStyle: 'italic' }}>
                Connecting to chat service...
              </Text>
            )}
            <TouchableOpacity
              onPress={loadAvailableCounsellors}
              style={{
                backgroundColor: colors.primary,
                paddingHorizontal: 24,
                paddingVertical: 12,
                borderRadius: 20,
                marginTop: 24
              }}
            >
              <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>
                Find Available Counselors
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Available Counselors Modal */}
      <Modal
        visible={showAvailableCounsellors}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAvailableCounsellors(false)}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          justifyContent: 'flex-end'
        }}>
          <View style={{
            backgroundColor: colors.card,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            maxHeight: '80%',
            paddingBottom: 20
          }}>
            <View style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: 16,
              borderBottomWidth: 1,
              borderBottomColor: colors.border
            }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: colors.cardText }}>
                Available Counselors
              </Text>
              <TouchableOpacity onPress={() => setShowAvailableCounsellors(false)}>
                <X size={24} color={colors.cardText} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ padding: 16 }}>
              {loadingCounsellors ? (
                <View style={{ alignItems: 'center', padding: 40 }}>
                  <ActivityIndicator size="large" color={colors.primary} />
                </View>
              ) : availableCounsellors.length === 0 ? (
                <View style={{ alignItems: 'center', padding: 40 }}>
                  <Text style={{ fontSize: 16, color: colors.muted, textAlign: 'center' }}>
                    No counselors are available at the moment.
                  </Text>
                  <Text style={{ fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 8 }}>
                    Please try again later.
                  </Text>
                </View>
              ) : (
                availableCounsellors.map((counsellor) => (
                  <TouchableOpacity
                    key={counsellor.id}
                    onPress={() => handleStartChat(counsellor.counsellorId || counsellor.id, counsellor.name)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      padding: 16,
                      backgroundColor: colors.bg,
                      borderRadius: 16,
                      marginBottom: 12,
                      borderWidth: 1,
                      borderColor: colors.border
                    }}
                  >
                    <View style={{ position: 'relative' }}>
                      {counsellor.profileImage ? (
                        <Image
                          source={{ uri: counsellor.profileImage }}
                          style={{ width: 56, height: 56, borderRadius: 28 }}
                          contentFit="cover"
                        />
                      ) : (
                        <View style={{
                          width: 56,
                          height: 56,
                          borderRadius: 28,
                          backgroundColor: colors.primary + '20',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          <Text style={{ fontSize: 24, fontWeight: '700', color: colors.primary }}>
                            {counsellor.firstName?.charAt(0) || counsellor.name?.charAt(0) || 'C'}
                          </Text>
                        </View>
                      )}
                      {counsellor.isOnline && (
                        <View style={{
                          position: 'absolute',
                          bottom: 2,
                          right: 2,
                          width: 14,
                          height: 14,
                          borderRadius: 7,
                          backgroundColor: '#10B981',
                          borderWidth: 2,
                          borderColor: colors.card
                        }} />
                      )}
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={{ fontSize: 16, fontWeight: '600', color: colors.cardText }}>
                        {counsellor.name}
                      </Text>
                      {counsellor.specialization && Array.isArray(counsellor.specialization) && counsellor.specialization.length > 0 && (
                        <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>
                          {counsellor.specialization.join(', ')}
                        </Text>
                      )}
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                        {counsellor.rating > 0 && (
                          <Text style={{ fontSize: 12, color: colors.muted }}>
                            ⭐ {counsellor.rating.toFixed(1)}
                          </Text>
                        )}
                        {counsellor.isOnline && (
                          <Text style={{ fontSize: 12, color: '#10B981', marginLeft: 8 }}>
                            Online
                          </Text>
                        )}
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleStartChat(counsellor.counsellorId || counsellor.id, counsellor.name)}
                      style={{
                        backgroundColor: colors.primary,
                        paddingHorizontal: 16,
                        paddingVertical: 8,
                        borderRadius: 16
                      }}
                    >
                      <Text style={{ color: 'white', fontSize: 14, fontWeight: '600' }}>
                        Chat
                      </Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
