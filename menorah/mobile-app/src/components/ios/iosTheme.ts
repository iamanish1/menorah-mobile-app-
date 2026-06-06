import { Platform, type TextStyle, type ViewStyle } from 'react-native';

export const iosTheme = {
  colors: {
    background: '#F8FAF7',
    surface: '#FFFFFF',
    surfaceAlt: '#EDF3EC',
    primary: '#243F2E',
    primaryDeep: '#183021',
    primaryMuted: '#5D6F5E',
    text: '#1C241D',
    textSecondary: '#6E756D',
    textMuted: '#90988F',
    border: '#E3E9E1',
    hairline: '#EEF2EC',
    white: '#FFFFFF',
    danger: '#D83A36',
    warning: '#B87422',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
  },
  radius: {
    sm: 12,
    md: 16,
    lg: 20,
    xl: 24,
    xxl: 28,
    pill: 999,
  },
  layout: {
    screenPadding: 22,
    maxContentWidth: 430,
  },
  typography: {
    title: {
      fontSize: 30,
      lineHeight: 36,
      fontWeight: '800',
      color: '#1C241D',
    } satisfies TextStyle,
    sectionTitle: {
      fontSize: 20,
      lineHeight: 26,
      fontWeight: '800',
      color: '#1C241D',
    } satisfies TextStyle,
    cardTitle: {
      fontSize: 17,
      lineHeight: 23,
      fontWeight: '800',
      color: '#1C241D',
    } satisfies TextStyle,
    body: {
      fontSize: 15,
      lineHeight: 22,
      fontWeight: '400',
      color: '#6E756D',
    } satisfies TextStyle,
    caption: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '700',
      color: '#5D6F5E',
    } satisfies TextStyle,
  },
  shadows: {
    card: Platform.select<ViewStyle>({
      ios: {
        shadowColor: '#183021',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.08,
        shadowRadius: 22,
      },
      default: {
        elevation: 2,
      },
    }),
    button: Platform.select<ViewStyle>({
      ios: {
        shadowColor: '#183021',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.14,
        shadowRadius: 18,
      },
      default: {
        elevation: 3,
      },
    }),
  },
} as const;

export type IOSTheme = typeof iosTheme;
