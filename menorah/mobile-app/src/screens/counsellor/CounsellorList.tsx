import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Search, Star, Clock, IndianRupee } from 'lucide-react-native';
import { Image } from 'expo-image';
import { useThemeMode } from '@/theme/ThemeProvider';
import { palettes } from '@/theme/colors';
import { api, Counsellor } from '@/lib/api';

export default function CounsellorList({ navigation }: any) {
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const [counsellors, setCounsellors] = useState<Counsellor[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadCounsellors = useCallback(async (searchQuery?: string) => {
    try {
      const response = await api.getCounsellors({
        search: searchQuery?.trim() || undefined,
        limit: 50,
        sortBy: 'rating',
        sortOrder: 'desc',
      });
      if (response.success && response.data) {
        setCounsellors(response.data.counsellors);
      }
    } catch (error) {
      console.error('Error loading counsellors:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadCounsellors();
  }, []);

  const handleSearch = (text: string) => {
    setSearch(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      loadCounsellors(text);
    }, 500);
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadCounsellors(search);
  };

  const renderCounsellor = ({ item }: { item: Counsellor }) => (
    <TouchableOpacity
      onPress={() => navigation.navigate('CounsellorProfile', { counsellorId: item.id })}
      activeOpacity={0.85}
      style={{
        backgroundColor: colors.card,
        borderRadius: 16,
        marginHorizontal: 16,
        marginBottom: 12,
        padding: 16,
        flexDirection: 'row',
        borderWidth: 1,
        borderColor: colors.border,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
        elevation: 2,
      }}
    >
      <Image
        source={
          item.profileImage
            ? { uri: item.profileImage }
            : require('../../../assets/brand/menorah_logo.png')
        }
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: colors.border,
        }}
        contentFit="cover"
      />

      <View style={{ flex: 1, marginLeft: 12, minWidth: 0 }}>
        {/* Name + badge */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
          <Text
            style={{ fontSize: 15, fontWeight: '700', color: colors.text, flex: 1 }}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {item.name}
          </Text>
          {item.isAvailable && (
            <View style={{
              backgroundColor: '#D1FAE5',
              borderRadius: 6,
              paddingHorizontal: 7,
              paddingVertical: 2,
              marginLeft: 6,
              flexShrink: 0,
            }}>
              <Text style={{ color: '#065F46', fontSize: 10, fontWeight: '700' }}>Available</Text>
            </View>
          )}
        </View>

        {/* Specialization */}
        <Text
          style={{ fontSize: 12, color: colors.muted, marginBottom: 10 }}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {item.specialization || 'Counsellor'}
        </Text>

        {/* Stats row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Star size={12} color="#F59E0B" fill="#F59E0B" />
            <Text style={{ fontSize: 12, color: colors.text, fontWeight: '600' }}>
              {item.rating?.toFixed(1) ?? '—'}
            </Text>
            {item.reviewCount > 0 && (
              <Text style={{ fontSize: 11, color: colors.muted }}>({item.reviewCount})</Text>
            )}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Clock size={12} color={colors.muted} />
            <Text style={{ fontSize: 12, color: colors.muted }}>{item.experience ?? 0}yr exp</Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <IndianRupee size={12} color={colors.primary} />
            <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '700' }}>
              {item.hourlyRate}/hr
            </Text>
          </View>
        </View>

        {/* Specialization tags */}
        {item.specializations?.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            {item.specializations.slice(0, 2).map((s) => (
              <View
                key={s}
                style={{
                  backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.08)' : '#F3F4F6',
                  borderRadius: 6,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  maxWidth: 120,
                }}
              >
                <Text
                  style={{ fontSize: 11, color: colors.muted, fontWeight: '500' }}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {s}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header */}
      <View style={{ backgroundColor: '#314830', paddingBottom: 16 }}>
        <SafeAreaView>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8 }}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 14 }}>
              <ArrowLeft size={24} color="white" />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={{ color: 'white', fontSize: 20, fontWeight: '700' }}>Find a Counsellor</Text>
              <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 2 }}>
                Book a session with a registered counsellor
              </Text>
            </View>
          </View>

          {/* Search */}
          <View style={{
            marginHorizontal: 16,
            marginTop: 14,
            backgroundColor: 'rgba(255,255,255,0.15)',
            borderRadius: 12,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 12,
            paddingVertical: 10,
          }}>
            <Search size={16} color="rgba(255,255,255,0.7)" />
            <TextInput
              value={search}
              onChangeText={handleSearch}
              placeholder="Search by name or specialization..."
              placeholderTextColor="rgba(255,255,255,0.5)"
              style={{ flex: 1, marginLeft: 10, color: 'white', fontSize: 14 }}
              returnKeyType="search"
              autoCorrect={false}
            />
          </View>
        </SafeAreaView>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: colors.muted, marginTop: 12, fontSize: 14 }}>Loading counsellors...</Text>
        </View>
      ) : (
        <FlatList
          data={counsellors}
          renderItem={renderCounsellor}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingTop: 16, paddingBottom: 32 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListHeaderComponent={
            counsellors.length > 0 ? (
              <Text style={{ marginHorizontal: 16, marginBottom: 12, fontSize: 13, color: colors.muted }}>
                {counsellors.length} counsellor{counsellors.length !== 1 ? 's' : ''} found
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 }}>
              <Text style={{ fontSize: 16, color: colors.muted, textAlign: 'center', lineHeight: 24 }}>
                {search.trim()
                  ? `No counsellors found for "${search}"`
                  : 'No counsellors available yet.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}
