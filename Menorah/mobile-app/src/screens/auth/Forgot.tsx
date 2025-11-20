import { View, Text } from 'react-native';
import { useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

export default function Forgot({ navigation }: any) {
  const [email, setEmail] = useState('');

  return (
    <View className="flex-1 p-6 bg-white">
      <View className="flex-1 justify-center">
        <Text className="text-3xl font-semibold mb-2">Reset password</Text>
        <Text className="text-slate-600 mb-8">
          Enter your email address and we'll send you a link to reset your password
        </Text>
        
        <Input
          label="Email"
          placeholder="Enter your email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        
        <Button title="Send Reset Link" onPress={() => navigation.navigate('Login')} />
      </View>
      
      <View className="items-center">
        <Text className="text-slate-600">
          Remember your password?{' '}
          <Text 
            onPress={() => navigation.navigate('Login')}
            className="text-brand-primary font-medium"
          >
            Sign in
          </Text>
        </Text>
      </View>
    </View>
  );
}
