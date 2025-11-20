// Design system colors matching mobile app
export const brand = {
  primary: "#314830",      // main green
  secondary: "#83834c",    // olive sub
  sand: "#fbf3e4",         // light sand
  bg: "#f1f1f1",           // app background
  text: "#151a16",         // deep neutral text
  border: "#E5E7EB",       // subtle border
};

export const colors = {
  brand: {
    primary: brand.primary,
    secondary: brand.secondary,
    sand: brand.sand,
  },
  text: {
    base: brand.text,
    muted: "#6b7280",
    invert: "#FFFFFF",
  },
  bg: {
    base: "#FFFFFF",
    subtle: brand.bg,
    surface: "#FFFFFF",
    invert: "#0B0F0A",
  },
  border: brand.border,
  success: "#16A34A",
  danger: "#EF4444",
  warning: "#F59E0B",
  info: "#3B82F6",
};

export const gradientHeader = [brand.primary, brand.secondary] as const;

