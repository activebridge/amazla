import { COLORS, SPACING, TYPOGRAPHY } from '../styles.js'

const STYLES = {
  container: {
    padding: SPACING.xl,
    borderTop: `1px solid ${COLORS.border}`,
    textAlign: 'center',
    marginTop: SPACING.xl,
  },
  section: {
    marginBottom: SPACING.lg,
  },
  title: {
    ...TYPOGRAPHY.cardTitle,
    marginBottom: SPACING.sm,
  },
  text: {
    ...TYPOGRAPHY.small,
    color: COLORS.textSecondary,
    lineHeight: '1.6',
  },
  privacy: {
    ...TYPOGRAPHY.small,
    color: COLORS.success,
    fontWeight: 'bold',
    marginTop: SPACING.lg,
    padding: `${SPACING.md} ${SPACING.lg}`,
    background: COLORS.surface,
    borderRadius: '6px',
  },
}

export const Footer = () => {
  return View({ style: STYLES.container }, [
    View({ style: STYLES.section }, [
      Text({ style: STYLES.title }, '📊 About'),
      Text({ style: STYLES.text }, 'Version 1.0 • April 2026'),
    ]),
    View({ style: STYLES.section }, [
      Text({ style: STYLES.title }, '🔐 Privacy'),
      Text({ style: STYLES.text, paragraph: true }, 
        'All communication is local Bluetooth.\n' +
        'No data is collected or sent anywhere.\n' +
        'Your vehicle and keys stay under your control.'
      ),
      Text({ style: STYLES.privacy }, '✅ No internet required after pairing'),
    ]),
  ])
}
