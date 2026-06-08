import React from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { useThemeMode } from '@/theme/ThemeProvider';
import { palettes } from '@/theme/colors';
import { TypingIndicator as TypingIndicatorType } from '@/lib/socket';

interface TypingIndicatorProps {
  typingUsers: TypingIndicatorType[];
  showAvatar?: boolean;
}

export default function TypingIndicator({ 
  typingUsers, 
  showAvatar = true 
}: TypingIndicatorProps) {
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];

  if (!typingUsers || typingUsers.length === 0) return null;

  const firstTypingUser = typingUsers[0];

  return (
    <View style={{
      flexDirection: 'row',
      justifyContent: 'flex-start',
      marginBottom: 16,
      paddingHorizontal: 16
    }}>
      {showAvatar && firstTypingUser && (
        <Image
          source={{ uri: (firstTypingUser as any).senderImage || "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?q=80&w=400&auto=format&fit=crop" }}
          style={{ width: 32, height: 32, borderRadius: 16, marginRight: 8 }}
          contentFit="cover"
        />
      )}
      
      <View style={{
        backgroundColor: colors.card,
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderWidth: 1,
        borderColor: colors.border,
        shadowColor: colors.border,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 1,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: colors.muted,
            opacity: 0.6
          }} />
          <View style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: colors.muted,
            opacity: 0.8
          }} />
          <View style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: colors.muted
          }} />
        </View>
        
        {typingUsers && typingUsers.length > 1 && (
          <Text style={{
            fontSize: 12,
            color: colors.muted,
            marginTop: 4
          }}>
            {typingUsers.length} people typing...
          </Text>
        )}
      </View>
    </View>
  );
}
