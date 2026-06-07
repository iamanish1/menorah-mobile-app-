export type Scheme = 'light' | 'dark';

export const palettes = {
  light: {
    primary: '#2d7a5c',      // primary-600
    secondary: '#3d9470',    // primary-500
    sand: '#f0f9f4',         // primary-50 — light green tint
    bg: '#f9fafb',           // surface-50 — page background
    surface: '#ffffff',      // cards/tiles
    surfaceAlt: '#f3f7f4',    // soft elevated/background tint
    text: '#111827',         // gray-900
    muted: '#6b7280',        // gray-500
    border: '#e5e7eb',       // gray-200
    card: '#ffffff',
    cardText: '#111827',
    accent: '#ff7d10',       // accent-500 — orange
    accentLight: '#fff8ed',  // accent-50
    error: '#ef4444',
    primaryDark: '#25624a',  // primary-700
    primaryLight: '#5fb08e', // primary-400
  },
  dark: {
    primary: '#A8F0C2',
    secondary: '#7DDBA4',
    sand: '#101813',
    bg: '#050806',
    surface: '#0D120F',
    surfaceAlt: '#151D17',
    text: '#F4F8F2',
    muted: '#8C9A91',
    border: '#263529',
    card: '#0D120F',
    cardText: '#F4F8F2',
    accent: '#F4BE6A',
    accentLight: '#2A1E0B',
    error: '#FF6B66',
    primaryDark: '#0B1710',
    primaryLight: '#B8F4CC',
  },
} as const;

export const headerGradient = (scheme: Scheme) =>
  scheme === 'dark'
    ? ['#050806', '#0B1710']
    : ['#2d7a5c', '#3d9470'];

// Legacy exports for backward compatibility
export const brand = {
  primary: '#2d7a5c',
  secondary: '#3d9470',
  sand: '#f0f9f4',
  bg: '#f9fafb',
  text: '#111827',
  border: '#e5e7eb',
  accent: '#ff7d10',
};

export const gradientHeader = [brand.primary, brand.secondary] as const;
