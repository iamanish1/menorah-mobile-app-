import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, TextInput, FlatList, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { ArrowLeft, MoreVertical, Phone, Send, Video } from 'lucide-react-native';
import { useThemeMode } from "@/theme/ThemeProvider";
import { palettes } from "@/theme/colors";
import { useChat } from "@/state/useChat";
import { useAuth } from "@/state/useAuth";
import { api } from "@/lib/api";
import ChatBubble from "@/components/chat/ChatBubble";
import TypingIndicator from "@/components/chat/TypingIndicator";
import { ChatMessage } from '@/lib/socket';

export default function ChatThread({ navigation, route }: any) {
  const { roomId, counsellorId } = route.params || {};
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const [safetyActionLoading, setSafetyActionLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const { user } = useAuth();
  const { 
    messages, 
    sendMessage: sendChatMessage, 
    typingUsers, 
    isConnected,
    fetchMessages,
    joinRoom,
    leaveRoom,
  } = useChat();
  
  const roomMessages = useMemo(() => messages[roomId] || [], [messages, roomId]);
  const typingInRoom = typingUsers[roomId] || [];
  const counsellorName = route.params?.counsellorName || 'Counsellor';
  const counsellorImage = route.params?.counsellorImage;
  const otherUserId = route.params?.counsellorUserId || counsellorId;
  

  const loadMessages = useCallback(async () => {
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
  }, [fetchMessages, roomId]);

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
  }, [joinRoom, leaveRoom, loadMessages, roomId]);

  useEffect(() => {
    if (roomMessages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [roomMessages]);

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

  const showSafetyResult = (title: string, response: { success: boolean; message?: string }) => {
    if (response.success) {
      Alert.alert(title, response.message || 'Thank you. The Menorah support team will review this.');
      return;
    }

    Alert.alert(
      `${title} Not Submitted`,
      response.message ||
        'This safety action is not fully connected yet. Please contact support from Settings so the team can review this manually.'
    );
  };

  const submitSafetyAction = async (action: () => Promise<{ success: boolean; message?: string }>, title: string) => {
    if (safetyActionLoading) return;

    setSafetyActionLoading(true);
    try {
      const response = await action();
      showSafetyResult(title, response);
    } catch (error) {
      console.error('Safety action error:', error);
      Alert.alert(
        `${title} Not Submitted`,
        'This safety action is not fully connected yet. Please contact support from Settings so the team can review this manually.'
      );
    } finally {
      setSafetyActionLoading(false);
    }
  };

  const handleReportUser = (userId?: string, reason = 'Unsafe or abusive behavior reported from chat') => {
    if (!userId) {
      Alert.alert('Report User', 'User information is missing for this chat.');
      return;
    }

    submitSafetyAction(
      () => api.reportUser({ userId, roomId, reason }),
      'Report Submitted'
    );
  };

  const handleBlockUser = (userId?: string) => {
    if (!userId) {
      Alert.alert('Block User', 'User information is missing for this chat.');
      return;
    }

    Alert.alert(
      'Block User',
      'Blocking helps limit unwanted contact where supported by the service. You can still contact support if there is an immediate safety concern.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: () =>
            submitSafetyAction(
              () => api.blockUser(userId, roomId),
              'Block Request Submitted'
            ),
        },
      ]
    );
  };

  const handleSafetyMenu = () => {
    Alert.alert(
      'Chat Safety',
      'Report unsafe behavior, block unwanted contact, or review the community guidelines.',
      [
        { text: 'Report User', onPress: () => handleReportUser(otherUserId) },
        { text: 'Block User', style: 'destructive', onPress: () => handleBlockUser(otherUserId) },
        { text: 'Community Guidelines', onPress: () => navigation.navigate('Legal', { type: 'community' }) },
        { text: 'Contact Support', onPress: () => navigation.navigate('Legal', { type: 'support' }) },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const handleMessageLongPress = (chatMessage: ChatMessage, isUser: boolean) => {
    if (isUser) {
      Alert.alert(
        'Message Options',
        'You can review the community guidelines or contact support if you need help with this conversation.',
        [
          { text: 'Community Guidelines', onPress: () => navigation.navigate('Legal', { type: 'community' }) },
          { text: 'Contact Support', onPress: () => navigation.navigate('Legal', { type: 'support' }) },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
      return;
    }

    Alert.alert(
      'Message Safety',
      'Report this message or take action on this user.',
      [
        {
          text: 'Report Message',
          onPress: () =>
            submitSafetyAction(
              () =>
                api.reportContent({
                  contentType: 'message',
                  contentId: chatMessage.id,
                  roomId,
                  reportedUserId: chatMessage.senderId,
                  reason: 'Unsafe or inappropriate message reported from chat',
                }),
              'Message Report Submitted'
            ),
        },
        { text: 'Report User', onPress: () => handleReportUser(chatMessage.senderId) },
        { text: 'Block User', style: 'destructive', onPress: () => handleBlockUser(chatMessage.senderId) },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const renderMessage = ({ item }: { item: any }) => {
    const isUser = item.senderId === user?.id;
    const chatMessage: ChatMessage = {
      id: item.id,
      content: item.content,
      timestamp: item.timestamp,
      senderId: item.senderId,
      senderName: item.senderName || (isUser ? `${user?.firstName} ${user?.lastName}` : counsellorName),
      senderImage: isUser ? user?.profileImage : counsellorImage,
      status: item.status || 'sent',
      type: item.type || 'text'
    };
    
    return (
      <ChatBubble
        message={chatMessage}
        isUser={isUser}
        showAvatar={!isUser}
        onLongPress={() => handleMessageLongPress(chatMessage, isUser)}
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
            <TouchableOpacity
              onPress={() => navigation.navigate('GenderSelection', { sessionType: 'audio' })}
              style={{
                width: 38, height: 38, borderRadius: 19,
                backgroundColor: colors.primary + '14',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Phone size={18} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => navigation.navigate('GenderSelection', { sessionType: 'video' })}
              style={{
                width: 38, height: 38, borderRadius: 19,
                backgroundColor: colors.primary + '14',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Video size={18} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSafetyMenu}
              disabled={safetyActionLoading}
              style={{
                width: 38, height: 38, borderRadius: 19,
                backgroundColor: colors.primary + '14',
                alignItems: 'center', justifyContent: 'center',
                opacity: safetyActionLoading ? 0.6 : 1,
              }}
            >
              <MoreVertical size={18} color={colors.primary} />
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

        <View style={{
          backgroundColor: '#FEF3C7',
          borderTopWidth: 1,
          borderTopColor: '#FDE68A',
          paddingHorizontal: 16,
          paddingVertical: 10
        }}>
          <Text style={{ color: '#92400E', fontSize: 12, lineHeight: 18 }}>
            This app is not an emergency service. If you are in immediate danger, contact local emergency services now.
          </Text>
          <TouchableOpacity onPress={() => navigation.navigate('CrisisHelp')} style={{ marginTop: 6 }}>
            <Text style={{ color: '#92400E', fontSize: 12, fontWeight: '700' }}>View crisis guidance</Text>
          </TouchableOpacity>
        </View>

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
