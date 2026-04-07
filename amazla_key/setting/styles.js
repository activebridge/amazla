// Color palette
export const COLORS = {
  background: '#1D1E1F',
  surface: '#2A2B2D',
  text: '#CCCCCC',
  textSecondary: '#999999',
  accent: '#4A90E2',
  success: '#90EE90',
  error: '#FF6B6B',
  border: '#3A3B3D',
  shadow: '#0d0d0d',
}

// Global styles
export const GLOBAL = {
  root: {
    background: COLORS.background,
    width: '100%',
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    padding: '0',
    margin: '0',
    boxSizing: 'border-box',
  },
  scrollContainer: {
    overflowY: 'auto',
    flex: '1',
    padding: '16px',
    width: '100%',
    boxSizing: 'border-box',
  },
}

// Spacing constants
export const SPACING = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
}

// Typography
export const TYPOGRAPHY = {
  title: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: COLORS.text,
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  cardTitle: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: COLORS.text,
  },
  body: {
    fontSize: '14px',
    color: COLORS.text,
    lineHeight: '1.5',
  },
  small: {
    fontSize: '12px',
    color: COLORS.textSecondary,
  },
}

// Reusable component styles
export const COMPONENTS = {
  container: {
    width: '100%',
    boxSizing: 'border-box',
  },
  card: {
    background: COLORS.surface,
    borderRadius: '8px',
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    boxShadow: `0 4px 8px ${COLORS.shadow}`,
    cursor: 'pointer',
  },
  section: {
    marginBottom: SPACING.xl,
  },
  sectionTitle: {
    ...TYPOGRAPHY.sectionTitle,
    borderLeft: `4px solid ${COLORS.accent}`,
    paddingLeft: SPACING.md,
  },
  button: {
    background: COLORS.accent,
    color: '#000000',
    padding: `${SPACING.md} ${SPACING.lg}`,
    borderRadius: '6px',
    fontWeight: 'bold',
    cursor: 'pointer',
    border: 'none',
    textAlign: 'center',
    marginTop: SPACING.md,
  },
  stepNumber: {
    background: COLORS.accent,
    color: '#000000',
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
    marginRight: SPACING.md,
    flexShrink: 0,
  },
}
