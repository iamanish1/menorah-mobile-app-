import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react-native';
import { useThemeMode } from '@/theme/ThemeProvider';
import { palettes } from '@/theme/colors';
import { networkManager, NetworkStatus } from '@/lib/network';

interface NetworkErrorProps {
  onRetry?: () => void;
  showDiagnostics?: boolean;
}

export default function NetworkError({ onRetry, showDiagnostics = false }: NetworkErrorProps) {
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];

  useEffect(() => {
    const handleNetworkChange = (status: NetworkStatus) => {
      setNetworkStatus(status);
    };

    networkManager.addListener(handleNetworkChange);
    
    // Get initial status
    networkManager.getCurrentStatus().then(setNetworkStatus);

    return () => {
      networkManager.removeListener(handleNetworkChange);
    };
  }, []);

  const handleRetry = async () => {
    setIsChecking(true);
    try {
      if (onRetry) {
        await onRetry();
      } else {
        // Default retry behavior
        const diagnostics = await networkManager.getNetworkDiagnostics();
        if (diagnostics.recommendations.length > 0) {
          Alert.alert(
            'Network Diagnostics',
            diagnostics.recommendations.join('\n\n'),
            [{ text: 'OK' }]
          );
        }
      }
    } finally {
      setIsChecking(false);
    }
  };

  const handleShowDiagnostics = async () => {
    setIsChecking(true);
    try {
      const diagnostics = await networkManager.getNetworkDiagnostics();
      Alert.alert(
        'Network Diagnostics',
        `Connection: ${diagnostics.networkStatus.isConnected ? 'Connected' : 'Disconnected'}\n` +
        `Type: ${diagnostics.networkStatus.type}\n` +
        `API Reachable: ${diagnostics.apiConnectivity.isReachable ? 'Yes' : 'No'}\n\n` +
        `Recommendations:\n${diagnostics.recommendations.join('\n')}`,
        [{ text: 'OK' }]
      );
    } finally {
      setIsChecking(false);
    }
  };

  if (!networkStatus) {
    return null;
  }

  return (
    <View style={{
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      padding: 16,
      margin: 16,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        {networkStatus.isConnected ? (
          <Wifi size={20} color={colors.primary} />
        ) : (
          <WifiOff size={20} color={colors.error} />
        )}
        <Text style={{
          marginLeft: 8,
          fontSize: 16,
          fontWeight: '600',
          color: colors.text,
        }}>
          {networkStatus.isConnected ? 'Connected' : 'No Internet Connection'}
        </Text>
      </View>

      <Text style={{
        fontSize: 14,
        color: colors.muted,
        marginBottom: 16,
        lineHeight: 20,
      }}>
        {networkStatus.isConnected 
          ? `Connected via ${networkStatus.type}`
          : 'Please check your internet connection and try again.'
        }
      </Text>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <TouchableOpacity
          onPress={handleRetry}
          disabled={isChecking}
          style={{
            flex: 1,
            backgroundColor: colors.primary,
            borderRadius: 8,
            paddingVertical: 12,
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'center',
            opacity: isChecking ? 0.7 : 1,
          }}
        >
          {isChecking ? (
            <RefreshCw size={16} color="white" style={{ marginRight: 8 }} />
          ) : null}
          <Text style={{ color: 'white', fontWeight: '600' }}>
            {isChecking ? 'Checking...' : 'Retry'}
          </Text>
        </TouchableOpacity>

        {showDiagnostics && (
          <TouchableOpacity
            onPress={handleShowDiagnostics}
            disabled={isChecking}
            style={{
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 8,
              paddingVertical: 12,
              paddingHorizontal: 16,
              opacity: isChecking ? 0.7 : 1,
            }}
          >
            <Text style={{ color: colors.text, fontWeight: '600' }}>
              Diagnostics
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
