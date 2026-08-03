import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Check, ChevronDown, Search } from 'lucide-react-native';
import { useThemeMode } from '@/theme/ThemeProvider';
import { palettes } from '@/theme/colors';
import {
  buildPhoneNumber,
  parsePhoneNumberParts,
  PHONE_COUNTRIES,
  type PhoneCountry,
} from '@/lib/phoneCountries';

type CountryPhoneInputProps = {
  label: string;
  value?: string;
  onChangeText: (value: string) => void;
  error?: string;
  hint?: string;
  required?: boolean;
};

export default function CountryPhoneInput({
  label,
  value = '',
  onChangeText,
  error,
  hint,
  required = false,
}: CountryPhoneInputProps) {
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const isDark = scheme === 'dark';
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState('');
  const progress = useRef(new Animated.Value(0)).current;

  const parsedPhone = useMemo(() => parsePhoneNumberParts(value), [value]);
  const [selectedCountry, setSelectedCountry] = useState(parsedPhone.country);
  const country = value
    ? selectedCountry.dialCode === parsedPhone.country.dialCode
      ? selectedCountry
      : parsedPhone.country
    : selectedCountry;
  const nationalNumber = parsedPhone.nationalNumber;
  const filteredCountries = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const numericNeedle = needle.replace(/\D/g, '');
    if (!needle) return PHONE_COUNTRIES;
    return PHONE_COUNTRIES.filter((item) =>
      item.name.toLowerCase().includes(needle) ||
      item.iso2.toLowerCase().includes(needle) ||
      item.dialCode.includes(numericNeedle)
    );
  }, [query]);

  useEffect(() => {
    if (value && selectedCountry.dialCode !== parsedPhone.country.dialCode) {
      setSelectedCountry(parsedPhone.country);
    }
  }, [parsedPhone.country, parsedPhone.country.dialCode, selectedCountry.dialCode, value]);

  useEffect(() => {
    if (!visible) return;
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: 190,
      useNativeDriver: true,
    }).start();
  }, [progress, visible]);

  const closePicker = () => {
    Animated.timing(progress, {
      toValue: 0,
      duration: 130,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setVisible(false);
        setQuery('');
      }
    });
  };

  const openPicker = () => setVisible(true);

  const selectCountry = (nextCountry: PhoneCountry) => {
    setSelectedCountry(nextCountry);
    onChangeText(buildPhoneNumber(nextCountry, nationalNumber));
    closePicker();
  };

  const sheetTranslateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [28, 0],
  });

  const sheetScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.98, 1],
  });

  return (
    <View style={{ marginBottom: 16 }}>
      <Text
        style={{
          fontSize: 14,
          fontWeight: '600',
          color: colors.text,
          marginBottom: 8,
        }}
      >
        {label}
        {required && <Text style={{ color: colors.error }}> *</Text>}
      </Text>

      <View
        style={{
          minHeight: 52,
          flexDirection: 'row',
          alignItems: 'stretch',
          borderWidth: 1,
          borderColor: error ? colors.error : colors.border,
          borderRadius: 16,
          backgroundColor: colors.card,
          overflow: 'hidden',
        }}
      >
        <TouchableOpacity
          activeOpacity={0.82}
          onPress={openPicker}
          accessibilityRole="button"
          accessibilityLabel="Choose phone country code"
          accessibilityState={{ expanded: visible }}
          style={{
            minWidth: 112,
            minHeight: 50,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
            paddingHorizontal: 12,
            borderRightWidth: 1,
            borderRightColor: colors.border,
            backgroundColor: isDark ? '#132018' : '#ECF8F1',
          }}
        >
          <View
            style={{
              minWidth: 30,
              height: 28,
              borderRadius: 999,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: isDark ? 'rgba(168, 240, 194, 0.14)' : 'rgba(45, 122, 92, 0.12)',
            }}
          >
            <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '800' }}>{country.iso2}</Text>
          </View>
          <Text style={{ color: colors.cardText, fontSize: 14, fontWeight: '700' }}>+{country.dialCode}</Text>
          <ChevronDown size={16} color={colors.muted} />
        </TouchableOpacity>

        <TextInput
          value={nationalNumber}
          onChangeText={(text) => onChangeText(buildPhoneNumber(country, text))}
          placeholder="50 360 4235"
          placeholderTextColor={colors.muted}
          keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'phone-pad'}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="telephoneNumber"
          style={{
            flex: 1,
            minHeight: 50,
            paddingHorizontal: 14,
            fontSize: 16,
            color: colors.cardText,
          }}
        />
      </View>

      {error ? (
        <Text style={{ fontSize: 12, color: colors.error, marginTop: 4, marginLeft: 4 }}>{error}</Text>
      ) : hint ? (
        <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4, marginLeft: 4 }}>{hint}</Text>
      ) : null}

      <Modal visible={visible} transparent animationType="none" onRequestClose={closePicker}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable
            accessibilityLabel="Close country code picker"
            onPress={closePicker}
            style={{
              ...StyleSheetAbsoluteFill,
              backgroundColor: isDark ? 'rgba(0, 0, 0, 0.62)' : 'rgba(17, 24, 39, 0.28)',
            }}
          />
          <Animated.View
            style={{
              transform: [{ translateY: sheetTranslateY }, { scale: sheetScale }],
              opacity: progress,
              maxHeight: '72%',
              marginHorizontal: 14,
              marginBottom: 14,
              borderRadius: 24,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              overflow: 'hidden',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 18 },
              shadowOpacity: 0.22,
              shadowRadius: 28,
              elevation: 12,
            }}
          >
            <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800', marginBottom: 12 }}>
                Select country code
              </Text>
              <View
                style={{
                  minHeight: 46,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 12,
                }}
              >
                <Search size={17} color={colors.muted} style={{ marginRight: 8 }} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search country or code"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={{ flex: 1, color: colors.cardText, fontSize: 15, minHeight: 44 }}
                />
              </View>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 360 }}>
              {filteredCountries.map((item) => {
                const selected = item.iso2 === country.iso2 && item.dialCode === country.dialCode;
                return (
                  <TouchableOpacity
                    key={`${item.iso2}-${item.dialCode}`}
                    activeOpacity={0.82}
                    onPress={() => selectCountry(item)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={{
                      minHeight: 54,
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: 16,
                      backgroundColor: selected ? (isDark ? '#17281E' : '#ECF8F1') : 'transparent',
                    }}
                  >
                    <Text style={{ width: 42, color: colors.primary, fontWeight: '800', fontSize: 12 }}>
                      {item.iso2}
                    </Text>
                    <Text style={{ flex: 1, color: colors.text, fontWeight: selected ? '700' : '500', fontSize: 15 }}>
                      {item.name}
                    </Text>
                    <Text style={{ color: colors.muted, fontSize: 14, marginRight: 10 }}>+{item.dialCode}</Text>
                    {selected && <Check size={17} color={colors.primary} />}
                  </TouchableOpacity>
                );
              })}
              {filteredCountries.length === 0 && (
                <Text style={{ color: colors.muted, padding: 18, fontSize: 14 }}>No country codes found.</Text>
              )}
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const StyleSheetAbsoluteFill = {
  position: 'absolute' as const,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
};
