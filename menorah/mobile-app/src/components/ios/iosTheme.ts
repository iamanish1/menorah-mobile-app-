import { Platform, type TextStyle, type ViewStyle } from 'react-native';
import { useThemeMode } from '@/theme/ThemeProvider';

const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

const radius = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 28,
  pill: 999,
} as const;

const layout = {
  screenPadding: 20,
  maxContentWidth: 430,
} as const;

const iosLightColors = {
  background: '#F7FAF6',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF4ED',
  surfaceElevated: '#FFFFFF',
  primary: '#304830',
  primaryDeep: '#183021',
  primaryMuted: '#5D6F5E',
  onPrimary: '#FFFFFF',
  text: '#1C241D',
  textSecondary: '#6E756D',
  textMuted: '#90988F',
  border: '#E3E9E1',
  hairline: '#EEF2EC',
  white: '#FFFFFF',
  danger: '#D83A36',
  dangerSoft: '#FCECEB',
  warning: '#B87422',
  tabGlass: 'rgba(255,255,255,0.74)',
  tabGlassBorder: 'rgba(255,255,255,0.56)',
  chatBanner: '#304830',
  chatBannerBorder: 'rgba(255,255,255,0.08)',
  heroOverlayStart: 'rgba(24,48,33,0.06)',
  heroOverlayMiddle: 'rgba(24,48,33,0.32)',
  heroOverlayEnd: 'rgba(24,48,33,0.82)',
  inverseText: '#FFFFFF',
  inverseTextSecondary: 'rgba(255,255,255,0.84)',
  inverseTextMuted: 'rgba(255,255,255,0.76)',
  inverseSurface: 'rgba(255,255,255,0.14)',
  inverseSurfaceBorder: 'rgba(255,255,255,0.20)',
  badgeBorder: '#FFFFFF',
  shadow: '#183021',
} as const;

const iosDarkColors = {
  background: '#050806',
  surface: '#0D120F',
  surfaceAlt: '#151D17',
  surfaceElevated: '#1A231C',
  primary: '#A8F0C2',
  primaryDeep: '#0B1710',
  primaryMuted: '#B8E8C8',
  onPrimary: '#07100A',
  text: '#F4F8F2',
  textSecondary: '#C7D5CB',
  textMuted: '#85958B',
  border: 'rgba(168,240,194,0.18)',
  hairline: 'rgba(168,240,194,0.10)',
  white: '#FFFFFF',
  danger: '#FF6B66',
  dangerSoft: 'rgba(255,107,102,0.16)',
  warning: '#F4BE6A',
  tabGlass: 'rgba(11,18,14,0.82)',
  tabGlassBorder: 'rgba(168,240,194,0.20)',
  chatBanner: '#0E1D13',
  chatBannerBorder: 'rgba(168,240,194,0.18)',
  heroOverlayStart: 'rgba(5,8,6,0.08)',
  heroOverlayMiddle: 'rgba(5,8,6,0.38)',
  heroOverlayEnd: 'rgba(5,8,6,0.86)',
  inverseText: '#FFFFFF',
  inverseTextSecondary: 'rgba(255,255,255,0.88)',
  inverseTextMuted: 'rgba(255,255,255,0.76)',
  inverseSurface: 'rgba(168,240,194,0.13)',
  inverseSurfaceBorder: 'rgba(168,240,194,0.22)',
  badgeBorder: '#050806',
  shadow: '#000000',
} as const;

function createTypography(colors: typeof iosLightColors | typeof iosDarkColors) {
  return {
    title: {
      fontSize: 31,
      lineHeight: 37,
      fontWeight: '900',
      color: colors.text,
    } satisfies TextStyle,
    sectionTitle: {
      fontSize: 21,
      lineHeight: 27,
      fontWeight: '900',
      color: colors.text,
    } satisfies TextStyle,
    cardTitle: {
      fontSize: 17,
      lineHeight: 23,
      fontWeight: '900',
      color: colors.text,
    } satisfies TextStyle,
    body: {
      fontSize: 15,
      lineHeight: 22,
      fontWeight: '400',
      color: colors.textSecondary,
    } satisfies TextStyle,
    caption: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '700',
      color: colors.primaryMuted,
    } satisfies TextStyle,
  };
}

function createShadows(colors: typeof iosLightColors | typeof iosDarkColors, cardOpacity: number, buttonOpacity: number) {
  return {
    card: Platform.select<ViewStyle>({
      ios: {
        shadowColor: colors.shadow,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: cardOpacity,
        shadowRadius: 18,
      },
      default: { elevation: 2 },
    }),
    button: Platform.select<ViewStyle>({
      ios: {
        shadowColor: colors.shadow,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: buttonOpacity,
        shadowRadius: 16,
      },
      default: { elevation: 3 },
    }),
  };
}

function createIOSTheme(colors: typeof iosLightColors | typeof iosDarkColors, cardOpacity: number, buttonOpacity: number) {
  return {
    colors,
    spacing,
    radius,
    layout,
    typography: createTypography(colors),
    shadows: createShadows(colors, cardOpacity, buttonOpacity),
  } as const;
}

export const iosLightTheme = createIOSTheme(iosLightColors, 0.07, 0.13);
export const iosDarkTheme = createIOSTheme(iosDarkColors, 0.28, 0.22);

export const iosTheme = iosLightTheme;

export type IOSTheme = ReturnType<typeof createIOSTheme>;

export function useIOSTheme(): IOSTheme {
  const { scheme } = useThemeMode();
  return scheme === 'dark' ? iosDarkTheme : iosLightTheme;
}
