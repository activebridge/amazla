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
}

// Main container styles
export const MAIN = {
  padding: '16px',
  background: COLORS.background,
  width: '100%',
  color: COLORS.text,
}

// Section title
export const SECTION_TITLE = {
  fontSize: '18px',
  fontWeight: 'bold',
  color: COLORS.text,
  margin: '16px 0 12px',
  paddingLeft: '8px',
  borderLeft: `4px solid ${COLORS.accent}`,
}

// Card styles
export const CARD = {
  background: COLORS.surface,
  borderRadius: '8px',
  padding: '12px',
  marginBottom: '8px',
  boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
}

// Step number circle
export const STEP_NUMBER = {
  background: COLORS.accent,
  color: '#000000',
  width: '32px',
  height: '32px',
  borderRadius: '50%',
  fontWeight: 'bold',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
}

// FAQ item
export const FAQ_ITEM = {
  background: COLORS.surface,
  borderRadius: '8px',
  padding: '12px',
  marginBottom: '8px',
  cursor: 'pointer',
}
