import React from 'react';
import { View, Text, TouchableOpacity, Modal, Image } from 'react-native';
import { X, Calendar, Gift } from 'lucide-react-native';
import { useThemeMode } from '@/theme/ThemeProvider';
import { palettes } from '@/theme/colors';

interface FreeSessionModalProps {
  visible: boolean;
  onClose: () => void;
  onBookSession: () => void;
}

export default function FreeSessionModal({ visible, onClose, onBookSession }: FreeSessionModalProps) {
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={{
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20
      }}>
        <View style={{
          backgroundColor: colors.card,
          borderRadius: 24,
          padding: 24,
          width: '100%',
          maxWidth: 340,
          borderWidth: 1,
          borderColor: colors.border,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.25,
          shadowRadius: 12,
          elevation: 8
        }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{
                backgroundColor: colors.primary + '15',
                borderRadius: 12,
                padding: 8,
                marginRight: 12
              }}>
                <Gift size={20} color={colors.primary} />
              </View>
              <Text style={{ fontSize: 18, fontWeight: '700', color: colors.cardText }}>
                Welcome!
              </Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <X size={24} color={colors.muted} />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ 
              fontSize: 20, 
              fontWeight: '700', 
              color: colors.cardText, 
              marginBottom: 12,
              textAlign: 'center'
            }}>
              Talk a Free Counselling Session
            </Text>
            
            <Text style={{ 
              fontSize: 14, 
              color: colors.muted, 
              lineHeight: 20,
              textAlign: 'center',
              marginBottom: 16
            }}>
              Start your mental health journey with a complimentary session with our expert counsellors.
            </Text>

            {/* Features */}
            <View style={{ marginBottom: 20 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <Calendar size={16} color={colors.primary} style={{ marginRight: 8 }} />
                <Text style={{ fontSize: 14, color: colors.cardText }}>45-minute session</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <Calendar size={16} color={colors.primary} style={{ marginRight: 8 }} />
                <Text style={{ fontSize: 14, color: colors.cardText }}>Expert counsellors</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Calendar size={16} color={colors.primary} style={{ marginRight: 8 }} />
                <Text style={{ fontSize: 14, color: colors.cardText }}>Completely confidential</Text>
              </View>
            </View>
          </View>

          {/* Buttons */}
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity
              onPress={onClose}
              style={{
                flex: 1,
                backgroundColor: colors.surface,
                borderRadius: 16,
                paddingVertical: 14,
                alignItems: 'center',
                borderWidth: 1,
                borderColor: colors.border
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.cardText }}>
                Maybe Later
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              onPress={onBookSession}
              style={{
                flex: 1,
                backgroundColor: colors.primary,
                borderRadius: 16,
                paddingVertical: 14,
                alignItems: 'center'
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: '600', color: 'white' }}>
                Book Free Session
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
