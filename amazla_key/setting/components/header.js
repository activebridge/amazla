import { COLORS, SPACING, TYPOGRAPHY } from '../styles.js'

const STYLES = {
  container: {
    padding: SPACING.xl,
    textAlign: 'center',
    borderBottom: `1px solid ${COLORS.border}`,
    marginBottom: SPACING.xl,
  },
  logoContainer: {
    marginBottom: SPACING.lg,
  },
  logo: {
    width: '100px',
    height: '100px',
    margin: '0 auto',
    display: 'block',
  },
  title: {
    ...TYPOGRAPHY.title,
    marginBottom: SPACING.sm,
  },
  subtitle: {
    ...TYPOGRAPHY.small,
    color: COLORS.textSecondary,
  },
}

export const Header = () => {
  return View({ style: STYLES.container }, [
    View({ style: STYLES.logoContainer }, [
      Image({
        src: '../../assets/tesla-logo.png',
        width: 100,
        height: 100,
        style: STYLES.logo,
        alt: 'Tesla Logo',
      }),
    ]),
    Text({ style: STYLES.title }, 'Tesla Key'),
    Text({ style: STYLES.subtitle }, 'Setup & Usage Instructions'),
  ])
}
