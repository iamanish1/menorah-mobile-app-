import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, TextInput, FlatList, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { ArrowLeft, Send, Phone, Video } from 'lucide-react-native';
import { useThemeMode } from "@/theme/ThemeProvider";
import { palettes } from "@/theme/colors";
import { useChat } from "@/state/useChat";
import { useAuth } from "@/state/useAuth";
import { api } from "@/lib/api";
import ChatBubble from "@/components/chat/ChatBubble";
import TypingIndicator from "@/components/chat/TypingIndicator";

export default function ChatThread({ navigation, route }: any) {
  const { roomId, counsellorId } = route.params || {};
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const { user } = useAuth();
  const { 
    messages, 
    sendMessage: sendChatMessage, 
    typingUsers, 
    onlineUsers,
    roomPresence,
    isConnected,
    fetchMessages,
    joinRoom,
    leaveRoom,
    chatRooms
  } = useChat();
  
  const roomMessages = messages[roomId] || [];
  const typingInRoom = typingUsers[roomId] || [];
  const counsellorName = route.params?.counsellorName || 'Counsellor';
  const counsellorImage = route.params?.counsellorImage;
  

  useEffect(() => {
    if (roomId) {
      loadMessages();
      joinRoom(roomId);
    }
    
    return () => {
      if (roomId) {
        leaveRoom(roomId);
      }
    };
  }, [roomId]);

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    if (roomMessages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [roomMessages]);

  const loadMessages = async () => {
    if (!roomId) return;
    
    setLoading(true);
    try {
      await fetchMessages(roomId);
    } catch (error: any) {
      console.error('Error loading messages:', error);
      Alert.alert('Error', 'Failed to load messages. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!message.trim() || !roomId || sending) return;
    
    const messageText = message.trim();
    setMessage('');
    setSending(true);
    setTyping(false);
    
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    try {
      await sendChatMessage(roomId, messageText);
      // Auto-scroll to bottom
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error: any) {
      console.error('Error sending message:', error);
      Alert.alert('Error', 'Failed to send message. Please try again.');
      setMessage(messageText); // Restore message on error
    } finally {
      setSending(false);
    }
  };

  const handleTyping = (text: string) => {
    setMessage(text);
    
    if (!roomId) return;
    
    if (text.length > 0 && !typing) {
      setTyping(true);
      // Send typing indicator via API
      api.sendTypingIndicator(roomId, true).catch(console.error);
    } else if (text.length === 0 && typing) {
      setTyping(false);
      api.sendTypingIndicator(roomId, false).catch(console.error);
    }
    
    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Set timeout to stop typing indicator after 3 seconds
    typingTimeoutRef.current = setTimeout(() => {
      if (typing) {
        setTyping(false);
        api.sendTypingIndicator(roomId, false).catch(console.error);
      }
    }, 3000);
  };

  const formatTimestamp = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diff = now.getTime() - date.getTime();
      const minutes = Math.floor(diff / (1000 * 60));
      
      if (minutes < 1) return 'Just now';
      if (minutes < 60) return `${minutes}m ago`;
      if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return timestamp;
    }
  };

  const renderMessage = ({ item }: { item: any }) => {
    const isUser = item.senderId === user?.id;
    
    return (
      <ChatBubble
        message={{
          id: item.id,
          content: item.content,
          timestamp: item.timestamp,
          senderId: item.senderId,
          senderName: item.senderName || (isUser ? `${user?.firstName} ${user?.lastName}` : counsellorName),
          senderImage: isUser ? user?.profileImage : counsellorImage,
          status: item.status || 'sent',
          type: item.type || 'text'
        }}
        isUser={isUser}
        showAvatar={!isUser}
      />
    );
  };


  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Header */}
        <View style={{
          backgroundColor: colors.card,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomLeftRadius: 24,
          borderBottomRightRadius: 24
        }}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{ marginRight: 12 }}
          >
            <ArrowLeft size={24} color={colors.cardText} />
          </TouchableOpacity>
          
          {counsellorImage ? (
            <Image
              source={{ uri: counsellorImage }}
              style={{ width: 40, height: 40, borderRadius: 20, marginRight: 12 }}
              contentFit="cover"
            />
          ) : (
            <View style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: colors.primary + '20',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 12
            }}>
              <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}>
                {counsellorName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.cardText }}>
              {counsellorName}
            </Text>
          </View>
          
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity onPress={() => Alert.alert('Audio Call', 'Audio call feature coming soon')}>
              <Phone size={20} color={colors.cardText} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => Alert.alert('Video Call', 'Video call feature coming soon')}>
              <Video size={20} color={colors.cardText} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Messages */}
        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={roomMessages}
            renderItem={renderMessage}
            keyExtractor={(item) => item.id}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingVertical: 16 }}
            ListEmptyComponent={
              <View style={{ alignItems: 'center', marginTop: 40, paddingHorizontal: 16 }}>
                <Text style={{ fontSize: 16, color: colors.muted, textAlign: 'center' }}>
                  No messages yet. Start the conversation!
                </Text>
              </View>
            }
            ListFooterComponent={
              typingInRoom && typingInRoom.length > 0 ? (
                <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
                  <TypingIndicator typingUsers={typingInRoom} />
                </View>
              ) : null
            }
            onContentSizeChange={() => {
              flatListRef.current?.scrollToEnd({ animated: false });
            }}
          />
        )}

        {/* Connection Status - Only show if disconnected for more than 5 seconds */}
        {!isConnected && (
          <View style={{
            backgroundColor: '#F59E0B',
            paddingHorizontal: 16,
            paddingVertical: 8,
            alignItems: 'center'
          }}>
            <Text style={{ color: 'white', fontSize: 12 }}>
              Connecting... (You can still send messages)
            </Text>
          </View>
        )}

        {/* Input */}
        <View style={{
          backgroundColor: colors.card,
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderTopWidth: 1,
          borderTopColor: colors.border
        }}>
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.surface,
            borderRadius: 24,
            paddingHorizontal: 16,
            paddingVertical: 8
          }}>
            <TextInput
              value={message}
              onChangeText={handleTyping}
              placeholder="Type a message..."
              placeholderTextColor={colors.muted}
              style={{
                flex: 1,
                fontSize: 16,
                color: colors.cardText,
                paddingVertical: 8,
                maxHeight: 100
              }}
              multiline
              editable={!sending}
            />
            <TouchableOpacity
              onPress={handleSendMessage}
              disabled={!message.trim() || sending}
              style={{
                backgroundColor: message.trim() ? colors.primary : colors.muted,
                borderRadius: 24,
                padding: 8,
                marginLeft: 8
              }}
            >
              {sending ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Send size={16} color="white" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
