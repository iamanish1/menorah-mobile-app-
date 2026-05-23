import React, { useState, useEffect, useCallback } from 'react';
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
  const [searchTimeout, setSearchTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

  const loadCounsellors = useCallback(async (searchQuery?: string) => {
    try {
      const response = await api.getCounsellors({
        search: searchQuery || undefined,
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
    if (searchTimeout) clearTimeout(searchTimeout);
    const t = setTimeout(() => loadCounsellors(text), 400);
    setSearchTimeout(t);
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadCounsellors(search);
  };

  const renderCounsellor = ({ item }: { item: Counsellor }) => (
    <TouchableOpacity
      onPress={() => navigation.navigate('CounsellorProfile', { counsellorId: item.id })}
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
        source={item.profileImage ? { uri: item.profileImage } : require('../../../assets/brand/menorah_logo.png')}
        style={{
          width: 68,
          height: 68,
          borderRadius: 34,
          backgroundColor: colors.border,
        }}
        contentFit="cover"
      />

      <View style={{ flex: 1, marginLeft: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, flex: 1 }} numberOfLines={1}>
            {item.name}
          </Text>
          {item.isAvailable ? (
            <View style={{ backgroundColor: '#D1FAE5', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ color: '#065F46', fontSize: 11, fontWeight: '600' }}>Available</Text>
            </View>
          ) : null}
        </View>

        <Text style={{ fontSize: 13, color: colors.muted, marginTop: 3 }} numberOfLines={1}>
          {item.specialization}
        </Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Star size={13} color="#F59E0B" fill="#F59E0B" />
            <Text style={{ fontSize: 13, color: colors.text, fontWeight: '600' }}>
              {item.rating?.toFixed(1) ?? '—'}
            </Text>
            {item.reviewCount > 0 && (
              <Text style={{ fontSize: 12, color: colors.muted }}>({item.reviewCount})</Text>
            )}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Clock size={13} color={colors.muted} />
            <Text style={{ fontSize: 13, color: colors.muted }}>{item.experience}yr exp</Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <IndianRupee size={13} color={colors.primary} />
            <Text style={{ fontSize: 13, color: colors.primary, fontWeight: '700' }}>
              {item.hourlyRate}/hr
            </Text>
          </View>
        </View>

        {item.specializations?.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {item.specializations.slice(0, 2).map((s) => (
              <View
                key={s}
                style={{ backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.08)' : '#F3F4F6', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}
              >
                <Text style={{ fontSize: 11, color: colors.muted, fontWeight: '500' }}>{s}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ backgroundColor: '#314830', paddingBottom: 16 }}>
        <SafeAreaView>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8 }}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 16 }}>
              <ArrowLeft size={24} color="white" />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={{ color: 'white', fontSize: 22, fontWeight: '600' }}>Find a Counsellor</Text>
              <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, marginTop: 4 }}>
                Book a session with a registered counsellor
              </Text>
            </View>
          </View>

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
            <Search size={18} color="rgba(255,255,255,0.7)" />
            <TextInput
              value={search}
              onChangeText={handleSearch}
              placeholder="Search by name or specialization..."
              placeholderTextColor="rgba(255,255,255,0.5)"
              style={{ flex: 1, marginLeft: 10, color: 'white', fontSize: 15 }}
            />
          </View>
        </SafeAreaView>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={counsellors}
          renderItem={renderCounsellor}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingTop: 16, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 60 }}>
              <Text style={{ fontSize: 16, color: colors.muted, textAlign: 'center' }}>
                {search ? 'No counsellors found for your search.' : 'No counsellors available yet.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}
