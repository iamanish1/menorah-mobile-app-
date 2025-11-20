import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Image } from "expo-image";
import { Star, MapPin, Clock } from "lucide-react-native";
import { useThemeMode } from "@/theme/ThemeProvider";
import { palettes } from "@/theme/colors";

interface CounsellorCardProps {
  counsellor: {
    id: number;
    name: string;
    avatar: string;
    rating: number;
    reviews: number;
    hourlyRate: number;
    language: string;
    specializations: string[];
    location: string;
    experience: string;
  };
  onPress: () => void;
  variant?: 'default' | 'compact';
}

export function CounsellorCard({ counsellor, onPress, variant = 'default' }: CounsellorCardProps) {
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];

  if (variant === 'compact') {
    return (
      <TouchableOpacity
        onPress={onPress}
        style={{
          backgroundColor: colors.card,
          borderRadius: 30,
          padding: 12,
          marginRight: 12,
          borderWidth: 1,
          borderColor: colors.border,
          minWidth: 200
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <Image
            source={{ uri: counsellor.avatar }}
            style={{ width: 40, height: 40, borderRadius: 20, marginRight: 12 }}
            contentFit="cover"
          />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.cardText, marginBottom: 4 }}>
              {counsellor.name}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Star size={14} color="#F59E0B" fill="#F59E0B" />
              <Text style={{ fontSize: 12, color: colors.cardText, marginLeft: 4 }}>
                {counsellor.rating}
              </Text>
            </View>
          </View>
        </View>
        
        <View style={{ marginBottom: 8 }}>
          <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 2 }}>
            {counsellor.language}
          </Text>
          <Text style={{ fontSize: 12, color: colors.muted }}>
            {counsellor.specializations.slice(0, 2).join(' • ')}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        backgroundColor: colors.card,
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: colors.border
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 }}>
        <Image
          source={{ uri: counsellor.avatar }}
          style={{ width: 60, height: 60, borderRadius: 30, marginRight: 16 }}
          contentFit="cover"
        />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: colors.cardText, marginBottom: 8 }}>
            {counsellor.name}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
            <Star size={16} color="#F59E0B" fill="#F59E0B" />
            <Text style={{ fontSize: 14, color: colors.cardText, marginLeft: 6 }}>
              {counsellor.rating} ({counsellor.reviews} reviews)
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
            <MapPin size={14} color={colors.muted} />
            <Text style={{ fontSize: 12, color: colors.muted, marginLeft: 4 }}>
              {counsellor.location}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Clock size={14} color={colors.muted} />
            <Text style={{ fontSize: 12, color: colors.muted, marginLeft: 4 }}>
              {counsellor.experience} experience
            </Text>
          </View>
        </View>
      </View>
      
      <View style={{ marginBottom: 12 }}>
        <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 4 }}>
          Languages: {counsellor.language}
        </Text>
        <Text style={{ fontSize: 12, color: colors.muted }}>
          Specializations: {counsellor.specializations.join(', ')}
        </Text>
      </View>
      
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 20, fontWeight: '700', color: colors.cardText }}>
          ₹{counsellor.hourlyRate}/hour
        </Text>
        <TouchableOpacity
          style={{
            backgroundColor: colors.primary,
            paddingHorizontal: 20,
            paddingVertical: 10,
            borderRadius: 20
          }}
        >
          <Text style={{ color: 'white', fontSize: 14, fontWeight: '600' }}>Book Session</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}
