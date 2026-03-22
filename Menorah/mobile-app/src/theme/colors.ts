export type Scheme = 'light' | 'dark';

export const palettes = {
  light: {
    primary: '#314830',
    secondary: '#83834c',
    sand: '#fbf3e4',
    bg: '#f1f1f1',       // page background
    surface: '#ffffff',  // cards/tiles
    text: '#151a16',
    muted: '#6b7280',
    border: '#E5E7EB',
    card: '#ffffff',
    cardText: '#151a16', // text inside content boxes
  },
  dark: {
    primary: '#314830',
    secondary: '#a7a06a',
    sand: '#111915',
    bg: '#07100c',
    surface: '#101915',
    text: '#f6f2e8',
    muted: '#97a39b',
    border: '#25332b',
    card: '#101915',
    cardText: '#f6f2e8',
  },
} as const;

export const headerGradient = (scheme: Scheme) =>
  scheme === 'dark'
    ? ['#1D2A1B', '#314830']           // darker header for dark mode
    : ['#314830', '#83834c'];          // brand gradient for light mode

// Legacy exports for backward compatibility
export const brand = {
  primary: "#314830",      // main green
  secondary: "#83834c",    // olive sub
  sand: "#fbf3e4",         // light sand
  bg: "#f1f1f1",           // app background
  text: "#151a16",         // deep neutral text
  border: "#E5E7EB"        // subtle border
};

export const gradientHeader = [brand.primary, brand.secondary] as const;
