// Shared design tokens for spacing, radii, and typography.
// Use these constants across screens to avoid magic numbers.

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
};

export const breakpoints = {
  phoneSmall: 360,
  phoneNormal: 480,
  tablet: 600,
};

export const textStyles = {
  screenTitle: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: '#111827',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: '#0f172a',
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#6b7280',
  },
  body: {
    fontSize: 14,
    color: '#111827',
  },
  helper: {
    fontSize: 12,
    color: '#6b7280',
  },
  kpiNumber: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: '#0f172a',
  },
};
