import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react-native';
import { useThemeMode } from '@/theme/ThemeProvider';
import { palettes } from '@/theme/colors';
import { useChat } from '@/state/useChat';
import { socketService } from '@/lib/socket';

interface ConnectionStatusProps {
  showDebug?: boolean;
}

export default function ConnectionStatus({ showDebug = false }: ConnectionStatusProps) {
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const { isConnected } = useChat();

  const handleReconnect = async () => {
    try {
      console.log('Manual reconnection attempt...');
      socketService.disconnect();
      await socketService.connect();
    } catch (error) {
      console.error('Manual reconnection failed:', error);
    }
  };

  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: isConnected ? colors.card : colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {isConnected ? (
          <Wifi size={16} color="#10B981" />
        ) : (
          <WifiOff size={16} color={colors.muted} />
        )}
        <Text style={{ 
          fontSize: 12, 
          color: isConnected ? '#10B981' : colors.muted, 
          marginLeft: 4,
          fontWeight: isConnected ? '600' : '400'
        }}>
          {isConnected ? 'Connected' : 'Disconnected'}
        </Text>
      </View>

      {showDebug && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 10, color: colors.muted }}>
            Socket.IO
          </Text>
          <TouchableOpacity
            onPress={handleReconnect}
            style={{
              padding: 4,
              borderRadius: 4,
              backgroundColor: colors.surface,
            }}
            activeOpacity={0.7}
          >
            <RefreshCw size={12} color={colors.muted} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
