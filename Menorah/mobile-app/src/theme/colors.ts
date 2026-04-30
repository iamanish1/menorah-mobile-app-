export type Scheme = 'light' | 'dark';

export const palettes = {
  light: {
    primary: '#2d7a5c',      // primary-600
    secondary: '#3d9470',    // primary-500
    sand: '#f0f9f4',         // primary-50 — light green tint
    bg: '#f9fafb',           // surface-50 — page background
    surface: '#ffffff',      // cards/tiles
    text: '#111827',         // gray-900
    muted: '#6b7280',        // gray-500
    border: '#e5e7eb',       // gray-200
    card: '#ffffff',
    cardText: '#111827',
    accent: '#ff7d10',       // accent-500 — orange
    accentLight: '#fff8ed',  // accent-50
    primaryDark: '#25624a',  // primary-700
    primaryLight: '#5fb08e', // primary-400
  },
  dark: {
    primary: '#3d9470',      // primary-500
    secondary: '#5fb08e',    // primary-400
    sand: '#0e241c',         // primary-950
    bg: '#0e241c',
    surface: '#1c4133',      // primary-900
    text: '#f9fafb',
    muted: '#9ca3af',        // gray-400
    border: '#25624a',       // primary-700
    card: '#1c4133',
    cardText: '#f9fafb',
    accent: '#ff9b37',       // accent-400
    accentLight: '#7f300f',
    primaryDark: '#2d7a5c',  // primary-600
    primaryLight: '#8fcdb0', // primary-300
  },
} as const;

export const headerGradient = (scheme: Scheme) =>
  scheme === 'dark'
    ? ['#1c4133', '#2d7a5c']
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
