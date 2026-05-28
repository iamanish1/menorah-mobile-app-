import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  ActivityIndicator, RefreshControl, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft, Search, Star, IndianRupee, LayoutGrid,
  Smile, Sun, Brain, ChevronDown, SlidersHorizontal,
  ShieldCheck, Heart, BadgeCheck, ChevronRight,
} from 'lucide-react-native';
import { Image } from 'expo-image';
import { useThemeMode } from '@/theme/ThemeProvider';
import { palettes } from '@/theme/colors';
import { api, Counsellor } from '@/lib/api';

const CATEGORIES = [
  { id: 'all',        label: 'All',        Icon: LayoutGrid },
  { id: 'anxiety',    label: 'Anxiety',    Icon: Smile       },
  { id: 'stress',     label: 'Stress',     Icon: Sun         },
  { id: 'depression', label: 'Depression', Icon: Brain       },
];

const SORT_OPTIONS = ['Relevance', 'Rating', 'Experience', 'Price'];

export default function CounsellorList({ navigation }: any) {
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const isDark = scheme === 'dark';

  const [counsellors, setCounsellors]   = useState<Counsellor[]>([]);
  const [filtered, setFiltered]         = useState<Counsellor[]>([]);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [search, setSearch]             = useState('');
  const [activeCategory, setCategory]   = useState('all');
  const [sortIdx, setSortIdx]           = useState(0);
  const [favorites, setFavorites]       = useState<Set<string>>(new Set());
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pageBg  = isDark ? colors.bg      : '#f8faf8';
  const cardBg  = isDark ? colors.surface : '#ffffff';

  const loadCounsellors = useCallback(async (q?: string) => {
    try {
      const res = await api.getCounsellors({ search: q?.trim() || undefined, limit: 50 });
      if (res.success && res.data) {
        setCounsellors(res.data.counsellors);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadCounsellors(); }, []);

  useEffect(() => {
    let list = [...counsellors];

    if (activeCategory !== 'all') {
      list = list.filter(c =>
        [c.specialization, ...(c.specializations || [])]
          .join(' ')
          .toLowerCase()
          .includes(activeCategory)
      );
    }

    switch (SORT_OPTIONS[sortIdx]) {
      case 'Rating':     list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)); break;
      case 'Experience': list.sort((a, b) => (b.experience ?? 0) - (a.experience ?? 0)); break;
      case 'Price':      list.sort((a, b) => (a.hourlyRate ?? 0) - (b.hourlyRate ?? 0)); break;
    }

    setFiltered(list);
  }, [counsellors, activeCategory, sortIdx]);

  const handleSearch = (text: string) => {
    setSearch(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => loadCounsellors(text), 500);
  };

  const toggleFav = (id: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const onRefresh = () => { setRefreshing(true); loadCounsellors(search); };

  const renderCard = ({ item }: { item: Counsellor }) => {
    const tags = item.specializations?.length > 0 ? item.specializations : [];
    const shown = tags.slice(0, 2);
    const extra = tags.length - shown.length;
    const isFav = favorites.has(item.id);

    return (
      <View style={{
        backgroundColor: cardBg,
        borderRadius: 20,
        marginHorizontal: 16,
        marginBottom: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: isDark ? colors.border : '#e8ede8',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: isDark ? 0.12 : 0.06,
        shadowRadius: 8,
        elevation: 2,
      }}>
        {/* Top row: avatar + info */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          {/* Avatar with online dot */}
          <View style={{ position: 'relative', marginRight: 14 }}>
            {item.profileImage ? (
              <Image
                source={{ uri: item.profileImage }}
                style={{ width: 76, height: 76, borderRadius: 38 }}
                contentFit="cover"
              />
            ) : (
              <View style={{
                width: 76, height: 76, borderRadius: 38,
                backgroundColor: colors.primary + '18',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ fontSize: 26, fontWeight: '800', color: colors.primary }}>
                  {item.name?.charAt(0)?.toUpperCase() || 'C'}
                </Text>
              </View>
            )}
            {item.isAvailable && (
              <View style={{
                position: 'absolute', bottom: 2, right: 2,
                width: 16, height: 16, borderRadius: 8,
                backgroundColor: '#22c55e',
                borderWidth: 2.5, borderColor: cardBg,
              }} />
            )}
          </View>

          {/* Info block */}
          <View style={{ flex: 1, minWidth: 0 }}>
            {/* Name row + View Profile button */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 2 }}>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginRight: 8 }}>
                <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text }} numberOfLines={1}>
                  {item.name}
                </Text>
                {item.isAvailable && (
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 4,
                    backgroundColor: '#dcfce7',
                    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20,
                  }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#16a34a' }} />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#16a34a' }}>Available</Text>
                  </View>
                )}
              </View>
              <TouchableOpacity
                onPress={() => navigation.navigate('CounsellorProfile', { counsellorId: item.id })}
                style={{
                  paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
                  borderWidth: 1.5, borderColor: isDark ? colors.border : '#d1d5db',
                  backgroundColor: 'transparent',
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text }}>View Profile</Text>
              </TouchableOpacity>
            </View>

            {/* Specialization */}
            <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 10 }} numberOfLines={1}>
              {item.specialization || 'Counsellor'}
            </Text>

            {/* Stats row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 0, marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Star size={13} color="#F59E0B" fill="#F59E0B" />
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>
                  {item.rating?.toFixed(1) ?? '—'}
                </Text>
                {item.reviewCount > 0 && (
                  <Text style={{ fontSize: 12, color: colors.muted }}> ({item.reviewCount})</Text>
                )}
              </View>
              <Text style={{ fontSize: 13, color: colors.border, marginHorizontal: 8 }}>|</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <BadgeCheck size={13} color={colors.muted} />
                <Text style={{ fontSize: 12, color: colors.muted }}>
                  {item.experience ?? 0} yrs exp
                </Text>
              </View>
              <Text style={{ fontSize: 13, color: colors.border, marginHorizontal: 8 }}>|</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                <IndianRupee size={12} color={colors.text} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>
                  {item.hourlyRate?.toLocaleString('en-IN') ?? '—'} /hr
                </Text>
              </View>
            </View>

            {/* Tags + heart */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', flex: 1 }}>
                {shown.map((s, i) => (
                  <View key={i} style={{
                    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f1',
                    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
                  }}>
                    <Text style={{ fontSize: 11, color: colors.muted, fontWeight: '500' }} numberOfLines={1}>
                      {s}
                    </Text>
                  </View>
                ))}
                {extra > 0 && (
                  <View style={{
                    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f1',
                    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
                  }}>
                    <Text style={{ fontSize: 11, color: colors.muted, fontWeight: '600' }}>+{extra}</Text>
                  </View>
                )}
              </View>
              <TouchableOpacity onPress={() => toggleFav(item.id)} style={{ paddingLeft: 10 }}>
                <Heart
                  size={20}
                  color={isFav ? '#ef4444' : colors.muted}
                  fill={isFav ? '#ef4444' : 'transparent'}
                />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  };

  const ListHeader = () => (
    <View>
      {/* Search bar */}
      <View style={{
        marginHorizontal: 16, marginTop: 16, marginBottom: 14,
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: cardBg,
        borderRadius: 50, borderWidth: 1, borderColor: isDark ? colors.border : '#e2e8e2',
        paddingHorizontal: 16, paddingVertical: 13,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
      }}>
        <Search size={18} color={colors.muted} />
        <TextInput
          value={search}
          onChangeText={handleSearch}
          placeholder="Search by name, issue or specialization..."
          placeholderTextColor={colors.muted}
          style={{ flex: 1, marginLeft: 10, color: colors.text, fontSize: 14 }}
          returnKeyType="search"
          autoCorrect={false}
        />
      </View>

      {/* Category chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 2, gap: 8 }}
        style={{ marginBottom: 16 }}
      >
        {CATEGORIES.map((cat) => {
          const active = activeCategory === cat.id;
          const CatIcon = cat.Icon;
          return (
            <TouchableOpacity
              key={cat.id}
              onPress={() => setCategory(cat.id)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingHorizontal: 16, paddingVertical: 10, borderRadius: 50,
                backgroundColor: active ? colors.primary : cardBg,
                borderWidth: 1.5,
                borderColor: active ? colors.primary : (isDark ? colors.border : '#d1d9d1'),
              }}
            >
              <CatIcon size={15} color={active ? 'white' : colors.muted} />
              <Text style={{
                fontSize: 14, fontWeight: '700',
                color: active ? 'white' : colors.text,
              }}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          );
        })}
        {/* More */}
        <TouchableOpacity style={{
          width: 40, height: 40, borderRadius: 20,
          backgroundColor: cardBg,
          borderWidth: 1.5, borderColor: isDark ? colors.border : '#d1d9d1',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <ChevronDown size={16} color={colors.muted} />
        </TouchableOpacity>
      </ScrollView>

      {/* Results + Sort */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, marginBottom: 12,
      }}>
        <Text style={{ fontSize: 13, color: colors.muted, fontWeight: '500' }}>
          {filtered.length} counsellor{filtered.length !== 1 ? 's' : ''} found
        </Text>
        <TouchableOpacity
          onPress={() => setSortIdx((sortIdx + 1) % SORT_OPTIONS.length)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
        >
          <Text style={{ fontSize: 13, color: colors.muted }}>Sort by: </Text>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>
            {SORT_OPTIONS[sortIdx]}
          </Text>
          <ChevronDown size={13} color={colors.primary} />
        </TouchableOpacity>
      </View>
    </View>
  );

  const ListFooter = () => (
    <TouchableOpacity
      activeOpacity={0.88}
      style={{
        marginHorizontal: 16, marginTop: 8, marginBottom: 32,
        flexDirection: 'row', alignItems: 'center', gap: 14,
        backgroundColor: cardBg,
        borderRadius: 18, padding: 16,
        borderWidth: 1, borderColor: isDark ? colors.border : '#e8ede8',
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
      }}
    >
      <View style={{
        width: 48, height: 48, borderRadius: 24,
        backgroundColor: colors.primary + '18',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <ShieldCheck size={22} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.primary, marginBottom: 2 }}>
          Verified & Trusted Professionals
        </Text>
        <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>
          All counsellors are verified and committed to your well-being.
        </Text>
      </View>
      <ChevronRight size={18} color={colors.muted} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: pageBg }} edges={['top']}>
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12,
      }}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{
            width: 42, height: 42, borderRadius: 21,
            backgroundColor: cardBg,
            borderWidth: 1, borderColor: isDark ? colors.border : '#e2e8e2',
            alignItems: 'center', justifyContent: 'center',
            marginRight: 12,
            shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
          }}
        >
          <ArrowLeft size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 24, fontWeight: '900', color: colors.text, letterSpacing: -0.4 }}>
            Find a Counsellor
          </Text>
          <Text style={{ fontSize: 13, color: colors.muted, marginTop: 1 }}>
            Book a session with a qualified professional
          </Text>
        </View>
        <TouchableOpacity
          style={{
            width: 42, height: 42, borderRadius: 21,
            backgroundColor: cardBg,
            borderWidth: 1, borderColor: isDark ? colors.border : '#e2e8e2',
            alignItems: 'center', justifyContent: 'center',
            shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
          }}
        >
          <SlidersHorizontal size={18} color={colors.text} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: colors.muted, marginTop: 12, fontSize: 14 }}>Loading counsellors...</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          renderItem={renderCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingTop: 0 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListHeaderComponent={<ListHeader />}
          ListFooterComponent={filtered.length > 0 ? <ListFooter /> : null}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 }}>
              <View style={{
                width: 80, height: 80, borderRadius: 40,
                backgroundColor: colors.primary + '14',
                alignItems: 'center', justifyContent: 'center', marginBottom: 16,
              }}>
                <Search size={32} color={colors.primary} />
              </View>
              <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 8, textAlign: 'center' }}>
                No counsellors found
              </Text>
              <Text style={{ fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 22 }}>
                {search.trim()
                  ? `No results for "${search}". Try a different search term.`
                  : 'No counsellors available right now. Pull down to refresh.'}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
