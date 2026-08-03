import { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Modal,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Search,
  Star,
  IndianRupee,
  ChevronDown,
  SlidersHorizontal,
  Heart,
  BadgeCheck,
  Check,
  X,
} from 'lucide-react-native';
import { Image } from 'expo-image';
import { useThemeMode } from '@/theme/ThemeProvider';
import { palettes } from '@/theme/colors';
import { Counsellor } from '@/lib/api';
import { useCounsellors, useSpecializations } from '@/hooks/useQueries';

const SORT_OPTIONS = ['Relevance', 'Rating', 'Experience', 'Price'];

const PRICE_RANGES = [
  { id: '1-1000', label: '₹1 – ₹1,000', minPrice: 1, maxPrice: 1000 },
  { id: '1000-3000', label: '₹1,000 – ₹3,000', minPrice: 1000, maxPrice: 3000 },
  { id: '3000-5000', label: '₹3,000 – ₹5,000', minPrice: 3000, maxPrice: 5000 },
  { id: '5000-plus', label: '₹5,000+', minPrice: 5000 },
] as const;

type PriceRangeId = (typeof PRICE_RANGES)[number]['id'];

export default function CounsellorList({ navigation, route }: any) {
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const isDark = scheme === 'dark';
  const initialSearch = typeof route?.params?.initialSearch === 'string' ? route.params.initialSearch : '';

  const [search, setSearch] = useState(initialSearch);
  const [debouncedSearch, setDebounced] = useState(initialSearch.trim());
  const [activeCategory, setCategory] = useState('all');
  const [selectedPriceRange, setSelectedPriceRange] = useState<PriceRangeId | null>(null);
  const [filterVisible, setFilterVisible] = useState(false);
  const [draftSpecialization, setDraftSpecialization] = useState<string | null>(null);
  const [draftPriceRange, setDraftPriceRange] = useState<PriceRangeId | null>(null);
  const [sortIdx, setSortIdx] = useState(0);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pageBg = isDark ? colors.bg : '#f8faf8';
  const cardBg = isDark ? colors.surface : '#ffffff';

  useEffect(() => {
    const nextSearch = typeof route?.params?.initialSearch === 'string' ? route.params.initialSearch : '';
    setSearch(nextSearch);
    setDebounced(nextSearch.trim());
  }, [route?.params?.initialSearch]);

  const { data: availableSpecializations = [] } = useSpecializations();

  const specializationTags = useMemo(
    () =>
      Array.from(
        new Set(
          availableSpecializations
            .map((specialization) => specialization.trim())
            .filter(Boolean),
        ),
      ).sort((first, second) => first.localeCompare(second)),
    [availableSpecializations],
  );

  const activePriceRange = useMemo(
    () => PRICE_RANGES.find((range) => range.id === selectedPriceRange),
    [selectedPriceRange],
  );

  const counsellorQueryParams = useMemo(
    () => ({
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      ...(activeCategory !== 'all'
        ? { specialization: activeCategory }
        : {}),
      ...(activePriceRange
        ? {
            minPrice: activePriceRange.minPrice,
            ...('maxPrice' in activePriceRange
              ? { maxPrice: activePriceRange.maxPrice }
              : {}),
          }
        : {}),
    }),
    [activeCategory, activePriceRange, debouncedSearch],
  );

  // ── React Query — replaces manual useState + useEffect + api call ─────────
  const { data, isLoading, isFetching, refetch } = useCounsellors(counsellorQueryParams);

  // ── Client-side filter + sort (no extra API calls needed) ─────────────────
  const filtered = useMemo(() => {
    let list = [...(data?.counsellors ?? [])];
    if (activeCategory !== 'all') {
      list = list.filter((c) =>
        [c.specialization, ...(c.specializations || [])].join(' ').toLowerCase().includes(activeCategory),
      );
    }
    if (activePriceRange) {
      list = list.filter((c) => {
        const withinMinimum = c.hourlyRate >= activePriceRange.minPrice;
        const withinMaximum =
          !('maxPrice' in activePriceRange) ||
          c.hourlyRate <= activePriceRange.maxPrice;
        return withinMinimum && withinMaximum;
      });
    }
    switch (SORT_OPTIONS[sortIdx]) {
      case 'Rating':
        list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
        break;
      case 'Experience':
        list.sort((a, b) => (b.experience ?? 0) - (a.experience ?? 0));
        break;
      case 'Price':
        list.sort((a, b) => (a.hourlyRate ?? 0) - (b.hourlyRate ?? 0));
        break;
    }
    return list;
  }, [data?.counsellors, activeCategory, activePriceRange, sortIdx]);

  const activeFilterCount =
    (activeCategory !== 'all' ? 1 : 0) + (selectedPriceRange ? 1 : 0);

  const openFilters = () => {
    setDraftSpecialization(
      activeCategory === 'all' ? null : activeCategory,
    );
    setDraftPriceRange(selectedPriceRange);
    setFilterVisible(true);
  };

  const applyFilters = () => {
    setCategory(draftSpecialization || 'all');
    setSelectedPriceRange(draftPriceRange);
    setFilterVisible(false);
  };

  const resetDraftFilters = () => {
    setDraftSpecialization(null);
    setDraftPriceRange(null);
  };

  const handleSearch = (text: string) => {
    setSearch(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    // Debounce: update the query key after 500ms so React Query fires one request
    searchTimer.current = setTimeout(() => setDebounced(text.trim()), 500);
  };

  const toggleFav = (id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const onRefresh = () => {
    refetch();
  };

  const renderCard = ({ item }: { item: Counsellor }) => {
    const tags = item.specializations?.length > 0 ? item.specializations : [];
    const shown = tags.slice(0, 2);
    const extra = tags.length - shown.length;
    const isFav = favorites.has(item.id);
    const AVATAR = 56;
    const INDENT = AVATAR + 10;

    return (
      <View
        style={{
          backgroundColor: cardBg,
          borderRadius: 18,
          marginHorizontal: 16,
          marginBottom: 10,
          padding: 14,
          borderWidth: 1,
          borderColor: isDark ? colors.border : '#e8ede8',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: isDark ? 0.1 : 0.05,
          shadowRadius: 6,
          elevation: 2,
        }}
      >
        {/* View Profile — absolute top-right */}
        <TouchableOpacity
          onPress={() => navigation.navigate('CounsellorProfile', { counsellorId: item.id })}
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            zIndex: 1,
            paddingHorizontal: 11,
            paddingVertical: 6,
            borderRadius: 20,
            borderWidth: 1.5,
            borderColor: isDark ? colors.border : '#d1d5db',
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: '600', color: colors.text }}>View Profile</Text>
        </TouchableOpacity>

        {/* Avatar + name/badge row — paddingRight reserves space for View Profile button */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            paddingRight: 96,
          }}
        >
          {/* Avatar */}
          <View style={{ position: 'relative', marginRight: 10, flexShrink: 0 }}>
            {item.profileImage ? (
              <Image
                source={{ uri: item.profileImage }}
                style={{
                  width: AVATAR,
                  height: AVATAR,
                  borderRadius: AVATAR / 2,
                }}
                contentFit="cover"
              />
            ) : (
              <View
                style={{
                  width: AVATAR,
                  height: AVATAR,
                  borderRadius: AVATAR / 2,
                  backgroundColor: colors.primary + '18',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    fontSize: 20,
                    fontWeight: '800',
                    color: colors.primary,
                  }}
                >
                  {item.name?.charAt(0)?.toUpperCase() || 'C'}
                </Text>
              </View>
            )}
            {item.isAvailable && (
              <View
                style={{
                  position: 'absolute',
                  bottom: 1,
                  right: 1,
                  width: 13,
                  height: 13,
                  borderRadius: 7,
                  backgroundColor: '#22c55e',
                  borderWidth: 2,
                  borderColor: cardBg,
                }}
              />
            )}
          </View>

          {/* Name + Available badge */}
          <View style={{ flex: 1, justifyContent: 'center', paddingTop: 3 }}>
            <Text
              style={{
                fontSize: 15,
                fontWeight: '800',
                color: colors.text,
                marginBottom: 4,
              }}
              numberOfLines={1}
            >
              {item.name}
            </Text>
            {item.isAvailable && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  backgroundColor: '#dcfce7',
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 20,
                  alignSelf: 'flex-start',
                }}
              >
                <View
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: 3,
                    backgroundColor: '#16a34a',
                  }}
                />
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#16a34a' }}>Available</Text>
              </View>
            )}
          </View>
        </View>

        {/* Specialization */}
        <Text
          style={{
            fontSize: 12,
            color: colors.muted,
            marginTop: 7,
            paddingLeft: INDENT,
          }}
          numberOfLines={1}
        >
          {item.specialization || 'Counsellor'}
        </Text>

        {/* Stats row */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: 7,
            paddingLeft: INDENT,
            flexWrap: 'wrap',
            rowGap: 3,
          }}
        >
          {/* Rating */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Star size={12} color="#F59E0B" fill="#F59E0B" />
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text }}>
              {item.rating?.toFixed(1) ?? '0.0'}
            </Text>
            {item.reviewCount > 0 && <Text style={{ fontSize: 11, color: colors.muted }}>({item.reviewCount})</Text>}
          </View>

          <Text
            style={{
              fontSize: 11,
              color: isDark ? colors.border : '#c8d0c8',
              marginHorizontal: 5,
            }}
          >
            |
          </Text>

          {/* Experience */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <BadgeCheck size={12} color={colors.muted} />
            <Text style={{ fontSize: 11, color: colors.muted }}>{item.experience ?? 0} yrs exp</Text>
          </View>

          <Text
            style={{
              fontSize: 11,
              color: isDark ? colors.border : '#c8d0c8',
              marginHorizontal: 5,
            }}
          >
            |
          </Text>

          {/* Price */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 2,
              flexShrink: 1,
            }}
          >
            <IndianRupee size={11} color={colors.text} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text }} numberOfLines={1}>
              {item.hourlyRate != null ? `${item.hourlyRate.toLocaleString('en-IN')} /hr` : '—'}
            </Text>
          </View>
        </View>

        {/* Specialty tags + heart */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 9,
            paddingLeft: INDENT,
          }}
        >
          <View style={{ flexDirection: 'row', gap: 5, flexWrap: 'wrap', flex: 1 }}>
            {shown.map((s, i) => (
              <View
                key={i}
                style={{
                  backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#f0f4f0',
                  borderRadius: 20,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    color: colors.muted,
                    fontWeight: '500',
                  }}
                  numberOfLines={1}
                >
                  {s}
                </Text>
              </View>
            ))}
            {extra > 0 && (
              <View
                style={{
                  backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#f0f4f0',
                  borderRadius: 20,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    color: colors.muted,
                    fontWeight: '600',
                  }}
                >
                  +{extra}
                </Text>
              </View>
            )}
          </View>
          <TouchableOpacity onPress={() => toggleFav(item.id)} style={{ paddingLeft: 10 }}>
            <Heart size={18} color={isFav ? '#ef4444' : colors.muted} fill={isFav ? '#ef4444' : 'transparent'} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const ListHeader = () => (
    <View>
      {/* Search bar */}
      <View
        style={{
          marginHorizontal: 16,
          marginTop: 12,
          marginBottom: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <View
          style={{
            flex: 1,
            minHeight: 52,
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: cardBg,
            borderRadius: 26,
            borderWidth: 1,
            borderColor: isDark ? colors.border : '#e2e8e2',
            paddingHorizontal: 14,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.04,
            shadowRadius: 4,
            elevation: 1,
          }}
        >
          <Search size={16} color={colors.muted} />
          <TextInput
            value={search}
            onChangeText={handleSearch}
            placeholder="Search by name, issue or specialization..."
            placeholderTextColor={colors.muted}
            accessibilityLabel="Search counsellors"
            style={{ flex: 1, minHeight: 50, marginLeft: 8, color: colors.text, fontSize: 13 }}
            returnKeyType="search"
            autoCorrect={false}
          />
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Filter counsellors"
          accessibilityHint="Filter by specialization and hourly price"
          onPress={openFilters}
          activeOpacity={0.76}
          style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            backgroundColor: activeFilterCount > 0
              ? colors.primary + '14'
              : cardBg,
            borderWidth: 1,
            borderColor: activeFilterCount > 0
              ? colors.primary
              : isDark
                ? colors.border
                : '#e2e8e2',
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.04,
            shadowRadius: 4,
            elevation: 1,
          }}
        >
          <SlidersHorizontal
            size={18}
            color={activeFilterCount > 0 ? colors.primary : colors.text}
          />
          {activeFilterCount > 0 ? (
            <View
              style={{
                position: 'absolute',
                top: 5,
                right: 5,
                minWidth: 17,
                height: 17,
                paddingHorizontal: 4,
                borderRadius: 9,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.primary,
                borderWidth: 1.5,
                borderColor: cardBg,
              }}
            >
              <Text
                style={{
                  color: 'white',
                  fontSize: 9,
                  lineHeight: 12,
                  fontWeight: '900',
                  fontVariant: ['tabular-nums'],
                }}
              >
                {activeFilterCount}
              </Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      {/* Results + Sort */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          marginBottom: 12,
        }}
      >
        <Text style={{ fontSize: 13, color: colors.muted, fontWeight: '500' }}>
          {filtered.length} counsellor{filtered.length !== 1 ? 's' : ''} found
        </Text>
        <TouchableOpacity
          onPress={() => setSortIdx((sortIdx + 1) % SORT_OPTIONS.length)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
        >
          <Text style={{ fontSize: 13, color: colors.muted }}>Sort by: </Text>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>{SORT_OPTIONS[sortIdx]}</Text>
          <ChevronDown size={13} color={colors.primary} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <>
      <SafeAreaView style={{ flex: 1, backgroundColor: pageBg }} edges={['top']}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingTop: 6,
          paddingBottom: 10,
        }}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: cardBg,
            borderWidth: 1,
            borderColor: isDark ? colors.border : '#e2e8e2',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 10,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.05,
            shadowRadius: 3,
            elevation: 1,
          }}
        >
          <ArrowLeft size={18} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 20,
              fontWeight: '900',
              color: colors.text,
              letterSpacing: -0.3,
            }}
          >
            Find a Counsellor
          </Text>
          <Text style={{ fontSize: 12, color: colors.muted, marginTop: 1 }}>
            Book a session with a qualified professional
          </Text>
        </View>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: colors.muted, marginTop: 12, fontSize: 14 }}>Loading counsellors...</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          renderItem={renderCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingTop: 0, paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isFetching && !isLoading} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListHeaderComponent={<ListHeader />}
          ListEmptyComponent={
            <View
              style={{
                alignItems: 'center',
                paddingTop: 60,
                paddingHorizontal: 32,
              }}
            >
              <View
                style={{
                  width: 68,
                  height: 68,
                  borderRadius: 34,
                  backgroundColor: colors.primary + '14',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 14,
                }}
              >
                <Search size={26} color={colors.primary} />
              </View>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '800',
                  color: colors.text,
                  marginBottom: 8,
                  textAlign: 'center',
                }}
              >
                No counsellors found
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: colors.muted,
                  textAlign: 'center',
                  lineHeight: 20,
                }}
              >
                {search.trim()
                  ? `No results for "${search}". Try a different search term.`
                  : 'No counsellors available right now. Pull down to refresh.'}
              </Text>
            </View>
          }
        />
      )}
      </SafeAreaView>

      <Modal
        visible={filterVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setFilterVisible(false)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: 'flex-end',
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close counsellor filters"
            onPress={() => setFilterVisible(false)}
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(12,24,16,0.48)',
            }}
          />

          <View
            accessibilityViewIsModal
            style={{
              maxHeight: '86%',
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              backgroundColor: cardBg,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingHorizontal: 16,
                paddingTop: 16,
                paddingBottom: 12,
                borderBottomWidth: 1,
                borderBottomColor: isDark ? colors.border : '#e8ede8',
              }}
            >
              <View style={{ flex: 1 }}>
                <Text
                  accessibilityRole="header"
                  style={{
                    color: colors.text,
                    fontSize: 20,
                    lineHeight: 26,
                    fontWeight: '900',
                  }}
                >
                  Filter counsellors
                </Text>
                <Text
                  style={{
                    color: colors.muted,
                    fontSize: 12,
                    lineHeight: 18,
                    marginTop: 2,
                  }}
                >
                  Choose a specialization and hourly price.
                </Text>
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Close filters"
                onPress={() => setFilterVisible(false)}
                activeOpacity={0.72}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  borderWidth: 1,
                  borderColor: isDark ? colors.border : '#dfe6df',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={19} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: 16,
                paddingTop: 18,
                paddingBottom: 24,
                gap: 24,
              }}
            >
              <View style={{ gap: 12 }}>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 15,
                    fontWeight: '900',
                  }}
                >
                  Specialization
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: 8,
                  }}
                >
                  {[null, ...specializationTags].map((specialization) => {
                    const normalizedSpecialization = specialization?.toLowerCase() ?? null;
                    const selected = draftSpecialization === normalizedSpecialization;
                    const label = specialization || 'Any specialization';
                    return (
                      <TouchableOpacity
                        key={specialization || 'any-specialization'}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        onPress={() =>
                          setDraftSpecialization(normalizedSpecialization)
                        }
                        activeOpacity={0.76}
                        style={{
                          minHeight: 42,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          borderRadius: 21,
                          backgroundColor: selected
                            ? colors.primary
                            : isDark
                              ? colors.surface
                              : '#f6f8f6',
                          borderWidth: 1,
                          borderColor: selected
                            ? colors.primary
                            : isDark
                              ? colors.border
                              : '#dce4dc',
                        }}
                      >
                        {selected ? (
                          <Check size={14} color="white" strokeWidth={2.8} />
                        ) : null}
                        <Text
                          style={{
                            color: selected ? 'white' : colors.text,
                            fontSize: 12,
                            fontWeight: '700',
                          }}
                        >
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={{ gap: 12 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 7,
                  }}
                >
                  <IndianRupee size={17} color={colors.primary} />
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 15,
                      fontWeight: '900',
                    }}
                  >
                    Hourly price
                  </Text>
                </View>
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: 8,
                  }}
                >
                  {PRICE_RANGES.map((range) => {
                    const selected = draftPriceRange === range.id;
                    return (
                      <TouchableOpacity
                        key={range.id}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        onPress={() => setDraftPriceRange(range.id)}
                        activeOpacity={0.76}
                        style={{
                          minHeight: 52,
                          flexBasis: '48%',
                          flexGrow: 1,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                          paddingHorizontal: 13,
                          paddingVertical: 10,
                          borderRadius: 16,
                          backgroundColor: selected
                            ? colors.primary + '14'
                            : isDark
                              ? colors.surface
                              : '#f8faf8',
                          borderWidth: 1.5,
                          borderColor: selected
                            ? colors.primary
                            : isDark
                              ? colors.border
                              : '#dce4dc',
                        }}
                      >
                        <Text
                          style={{
                            flex: 1,
                            color: selected ? colors.primary : colors.text,
                            fontSize: 13,
                            fontWeight: selected ? '800' : '700',
                            fontVariant: ['tabular-nums'],
                          }}
                        >
                          {range.label}
                        </Text>
                        <View
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 10,
                            borderWidth: 1.5,
                            borderColor: selected
                              ? colors.primary
                              : colors.muted,
                            backgroundColor: selected
                              ? colors.primary
                              : 'transparent',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {selected ? (
                            <Check size={12} color="white" strokeWidth={3} />
                          ) : null}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </ScrollView>

            <SafeAreaView
              edges={['bottom']}
              style={{
                borderTopWidth: 1,
                borderTopColor: isDark ? colors.border : '#e8ede8',
                backgroundColor: cardBg,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  gap: 10,
                  paddingHorizontal: 16,
                  paddingTop: 12,
                  paddingBottom: 12,
                }}
              >
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={resetDraftFilters}
                  activeOpacity={0.72}
                  style={{
                    minHeight: 52,
                    flex: 1,
                    borderRadius: 26,
                    borderWidth: 1.5,
                    borderColor: isDark ? colors.border : '#d7dfd7',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 14,
                      fontWeight: '800',
                    }}
                  >
                    Reset
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={applyFilters}
                  activeOpacity={0.82}
                  style={{
                    minHeight: 52,
                    flex: 1.6,
                    borderRadius: 26,
                    backgroundColor: colors.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    style={{
                      color: 'white',
                      fontSize: 14,
                      fontWeight: '900',
                    }}
                  >
                    Apply filters
                  </Text>
                </TouchableOpacity>
              </View>
            </SafeAreaView>
          </View>
        </View>
      </Modal>
    </>
  );
}
