import React from "react";
import { View, TextInput, Text } from "react-native";
import { useThemeMode } from "@/theme/ThemeProvider";
import { palettes } from "@/theme/colors";

interface InputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  label?: string;
  error?: string;
  secureTextEntry?: boolean;
  style?: any;
}

export default function Input({ 
  value, 
  onChangeText, 
  placeholder, 
  label, 
  error, 
  secureTextEntry = false,
  style 
}: InputProps) {
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];

  return (
    <View style={{ marginBottom: 16 }}>
      {label && (
        <Text style={{ 
          fontSize: 14, 
          fontWeight: '500', 
          color: colors.text, 
          marginBottom: 8 
        }}>
          {label}
        </Text>
      )}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        secureTextEntry={secureTextEntry}
        style={[
          {
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: error ? '#EF4444' : colors.border,
            borderRadius: 16,
            paddingHorizontal: 16,
            paddingVertical: 12,
            fontSize: 16,
            color: colors.cardText,
          },
          style
        ]}
      />
      {error && (
        <Text style={{ 
          fontSize: 12, 
          color: '#EF4444', 
          marginTop: 4 
        }}>
          {error}
        </Text>
      )}
    </View>
  );
}
