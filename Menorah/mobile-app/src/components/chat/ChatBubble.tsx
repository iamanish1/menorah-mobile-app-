import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Check, CheckCheck } from 'lucide-react-native';
import { useThemeMode } from '@/theme/ThemeProvider';
import { palettes } from '@/theme/colors';
import { ChatMessage } from '@/lib/socket';

interface ChatBubbleProps {
  message: ChatMessage;
  isUser: boolean;
  showAvatar?: boolean;
  onLongPress?: () => void;
}

export default function ChatBubble({ 
  message, 
  isUser, 
  showAvatar = true, 
  onLongPress 
}: ChatBubbleProps) {
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getMessageStatus = () => {
    if (!isUser) return null;
    
    switch (message.status) {
      case 'sent':
        return <Check size={12} color={colors.muted} />;
      case 'delivered':
        return <CheckCheck size={12} color={colors.muted} />;
      case 'read':
        return <CheckCheck size={12} color="#10B981" />;
      default:
        return null;
    }
  };

  return (
    <View style={{
      flexDirection: 'row',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: 16,
      paddingHorizontal: 16
    }}>
      {!isUser && showAvatar && (
        <Image
          source={{ uri: message.senderImage || "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?q=80&w=400&auto=format&fit=crop" }}
          style={{ width: 32, height: 32, borderRadius: 16, marginRight: 8 }}
          contentFit="cover"
        />
      )}
      
      <TouchableOpacity
        onLongPress={onLongPress}
        activeOpacity={0.8}
        style={{
          maxWidth: '70%',
          backgroundColor: isUser ? colors.primary : colors.card,
          borderRadius: 16,
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderWidth: 1,
          borderColor: isUser ? colors.primary : colors.border,
          shadowColor: colors.border,
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.1,
          shadowRadius: 2,
          elevation: 1,
        }}
      >
        <Text style={{
          fontSize: 16,
          color: isUser ? 'white' : colors.cardText,
          lineHeight: 20
        }}>
          {message.content}
        </Text>
        
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'flex-end',
          marginTop: 4,
          gap: 4
        }}>
          <Text style={{
            fontSize: 12,
            color: isUser ? 'rgba(255, 255, 255, 0.7)' : colors.muted
          }}>
            {formatTimestamp(message.timestamp)}
          </Text>
          {getMessageStatus()}
        </View>
      </TouchableOpacity>
    </View>
  );
}
