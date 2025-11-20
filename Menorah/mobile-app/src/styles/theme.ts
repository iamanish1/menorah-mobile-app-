import { StyleSheet } from 'react-native';
import { brand } from '@/theme/colors';

export const colors = {
  brand: {
    primary: brand.primary,
    secondary: brand.secondary,
    sand: brand.sand,
  },
  text: {
    base: brand.text,
    muted: '#475569',
    invert: '#FFFFFF',
  },
  bg: {
    base: '#FFFFFF',
    subtle: brand.bg,
    surface: '#FFFFFF',
    invert: '#0B1220',
  },
  border: brand.border,
  success: '#16A34A',
  danger: '#EF4444',
};

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
};

export const borderRadius = {
  sm: 12,
  md: 16,
  lg: 24,
  xl: 28,
};

export const typography = {
  h1: { fontSize: 28, fontWeight: 'bold' as const },
  h2: { fontSize: 22, fontWeight: 'bold' as const },
  h3: { fontSize: 18, fontWeight: 'bold' as const },
  body: { fontSize: 16, fontWeight: 'normal' as const },
  caption: { fontSize: 13, fontWeight: 'normal' as const },
};

export const shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 3,
  },
};

export const styles = StyleSheet.create({
  // Layout
  container: {
    flex: 1,
    backgroundColor: brand.bg,
  },
  safeArea: {
    flex: 1,
    backgroundColor: brand.bg,
  },
  
  // Headers
  headerPrimary: {
    backgroundColor: brand.primary,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerText: {
    color: colors.text.invert,
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: spacing.sm,
  },
  headerSubtext: {
    color: colors.text.invert + 'E6',
    fontSize: 16,
  },
  
  // Cards
  card: {
    backgroundColor: colors.bg.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  
  // Buttons
  buttonPrimary: {
    backgroundColor: brand.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonOutline: {
    backgroundColor: colors.bg.base,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: colors.text.invert,
    fontSize: 16,
    fontWeight: '600',
  },
  buttonTextOutline: {
    color: colors.text.base,
    fontSize: 16,
    fontWeight: '600',
  },
  
  // Text
  textH1: typography.h1,
  textH2: typography.h2,
  textH3: typography.h3,
  textBody: typography.body,
  textCaption: typography.caption,
  textMuted: {
    ...typography.body,
    color: colors.text.muted,
  },
  
  // Spacing
  px4: { paddingHorizontal: spacing.md },
  py6: { paddingVertical: spacing.lg },
  mb4: { marginBottom: spacing.md },
  mb6: { marginBottom: spacing.lg },
  
  // Flex
  flex1: { flex: 1 },
  flexRow: { flexDirection: 'row' },
  itemsCenter: { alignItems: 'center' },
  justifyCenter: { justifyContent: 'center' },
  justifyBetween: { justifyContent: 'space-between' },
});
