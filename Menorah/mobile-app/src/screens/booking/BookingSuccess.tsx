import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CheckCircle } from 'lucide-react-native';
import Button from '@/components/ui/Button';
import { useThemeMode } from "@/theme/ThemeProvider";
import { palettes } from "@/theme/colors";

export default function BookingSuccess({ navigation, route }: any) {
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        {/* Success Icon */}
        <View style={{
          backgroundColor: '#10B981' + '20',
          borderRadius: 50,
          padding: 20,
          marginBottom: 24
        }}>
          <CheckCircle size={48} color="#10B981" />
        </View>

        {/* Success Message */}
        <Text style={{
          fontSize: 28,
          fontWeight: '700',
          color: colors.cardText,
          marginBottom: 12,
          textAlign: 'center'
        }}>
          Payment Successful!
        </Text>
        
        <Text style={{
          fontSize: 16,
          color: colors.muted,
          marginBottom: 32,
          textAlign: 'center',
          lineHeight: 24
        }}>
          Your session has been confirmed. We'll match you with the perfect therapist based on your preferences.
        </Text>

        {/* Next Steps */}
        <View style={{
          backgroundColor: '#F0F9FF',
          borderRadius: 12,
          padding: 16,
          marginBottom: 32,
          borderWidth: 1,
          borderColor: '#0EA5E9'
        }}>
          <Text style={{
            fontSize: 16,
            fontWeight: '600',
            color: '#0C4A6E',
            marginBottom: 8
          }}>
            What happens next?
          </Text>
          <Text style={{
            fontSize: 14,
            color: '#0C4A6E',
            lineHeight: 20
          }}>
            • You'll receive a confirmation email with session details{'\n'}
            • Your therapist will be assigned within 24 hours{'\n'}
            • You'll get a notification when your therapist is ready{'\n'}
            • Session details will be shared via email and app
          </Text>
        </View>

        {/* Action Buttons */}
        <View style={{ width: '100%', gap: 12 }}>
          <Button 
            title="View My Bookings" 
            onPress={() => navigation.navigate('Tabs', { screen: 'Bookings' })}
            style={{ width: '100%' }}
          />
          
          <Button 
            title="Back to Home"
            variant="outline"
            onPress={() => navigation.navigate('Tabs', { screen: 'Discover' })}
            style={{ width: '100%' }}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
