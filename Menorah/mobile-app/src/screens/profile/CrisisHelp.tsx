import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Phone, MessageCircle, Heart, AlertTriangle, Clock } from 'lucide-react-native';
import { useThemeMode } from "@/theme/ThemeProvider";
import { palettes } from "@/theme/colors";

export default function CrisisHelp({ navigation }: any) {
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];

  const emergencyNumbers = [
    {
      name: 'National Crisis Helpline',
      number: '1800-123-4567',
      description: '24/7 crisis support and suicide prevention'
    },
    {
      name: 'Mental Health Helpline',
      number: '1800-987-6543',
      description: 'Professional mental health support'
    }
  ];

  const resources = [
    {
      title: 'Crisis Text Line',
      description: 'Text HOME to 741741 to connect with a crisis counselor',
      color: '#FEF3C7',
      textColor: '#92400E'
    },
    {
      title: 'Emergency Services',
      description: 'Call 112 for immediate emergency assistance',
      color: '#FEE2E2',
      textColor: '#991B1B'
    }
  ];

  const handleCall = (number: string) => {
    Linking.openURL(`tel:${number}`);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header */}
      <View style={{
        backgroundColor: colors.primary,
        paddingHorizontal: 16,
        paddingVertical: 20,
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24
      }}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <ArrowLeft size={24} color="white" />
        </TouchableOpacity>
        <Text style={{ 
          color: 'white', 
          fontSize: 20, 
          fontWeight: '700', 
          marginLeft: 16 
        }}>
          Crisis Help
        </Text>
      </View>

      <ScrollView style={{ flex: 1, paddingHorizontal: 16, paddingTop: 24 }} showsVerticalScrollIndicator={false}>
        {/* Emergency Alert */}
        <View style={{
          backgroundColor: '#EF4444' + '0A',
          borderWidth: 1,
          borderColor: '#EF4444' + '20',
          borderRadius: 20,
          padding: 16,
          marginBottom: 24
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <AlertTriangle size={24} color="#EF4444" style={{ marginRight: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={{
                color: '#EF4444',
                fontWeight: '600',
                fontSize: 18,
                marginBottom: 8
              }}>
                Need Immediate Help?
              </Text>
              <Text style={{
                color: '#EF4444',
                lineHeight: 20
              }}>
                If you're in crisis or having thoughts of self-harm, please call emergency services immediately.
              </Text>
            </View>
          </View>
        </View>

        {/* Emergency Numbers */}
        <Text style={{ 
          fontSize: 22, 
          fontWeight: '700', 
          color: colors.text, 
          marginBottom: 16 
        }}>
          Emergency Helplines
        </Text>
        <View style={{ marginBottom: 24 }}>
          {emergencyNumbers.map((item, index) => (
            <TouchableOpacity
              key={index}
              onPress={() => handleCall(item.number)}
              style={{
                backgroundColor: colors.card,
                borderRadius: 20,
                padding: 16,
                marginBottom: 12,
                borderWidth: 1,
                borderColor: colors.border
              }}
            >
              <View style={{ flexDirection: 'row' }}>
                <View style={{
                  width: 48,
                  height: 48,
                  backgroundColor: '#EF4444' + '1A',
                  borderRadius: 24,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 16
                }}>
                  <Phone size={24} color="#EF4444" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{
                    fontSize: 16,
                    fontWeight: '600',
                    color: colors.cardText,
                    marginBottom: 4
                  }}>
                    {item.name}
                  </Text>
                  <Text style={{
                    fontSize: 14,
                    color: colors.muted,
                    marginBottom: 8
                  }}>
                    {item.description}
                  </Text>
                  <Text style={{
                    fontSize: 16,
                    fontWeight: '700',
                    color: '#EF4444'
                  }}>
                    {item.number}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Resources */}
        <Text style={{ 
          fontSize: 22, 
          fontWeight: '700', 
          color: colors.text, 
          marginBottom: 16 
        }}>
          Additional Resources
        </Text>
        <View style={{ marginBottom: 24 }}>
          {resources.map((item, index) => (
            <View
              key={index}
              style={{
                backgroundColor: colors.card,
                borderRadius: 20,
                padding: 16,
                marginBottom: 12,
                borderWidth: 1,
                borderColor: colors.border
              }}
            >
              <View style={{ flexDirection: 'row' }}>
                <View style={{
                  width: 48,
                  height: 48,
                  backgroundColor: item.color,
                  borderRadius: 24,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 16
                }}>
                  <MessageCircle size={24} color={item.textColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{
                    fontSize: 16,
                    fontWeight: '600',
                    color: colors.cardText,
                    marginBottom: 4
                  }}>
                    {item.title}
                  </Text>
                  <Text style={{
                    fontSize: 14,
                    color: colors.muted
                  }}>
                    {item.description}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* Disclaimer */}
        <View style={{
          backgroundColor: colors.card,
          borderRadius: 20,
          padding: 16,
          borderWidth: 1,
          borderColor: colors.border
        }}>
          <Text style={{
            fontSize: 14,
            color: colors.muted,
            textAlign: 'center',
            lineHeight: 20
          }}>
            These resources are provided for emergency situations. For ongoing mental health support, 
            please book a session with one of our licensed counsellors.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
