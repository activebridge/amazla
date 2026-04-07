import { COMPONENTS, TYPOGRAPHY, COLORS, SPACING } from '../styles.js'

const STYLES = {
  container: {
    ...COMPONENTS.section,
  },
  title: {
    ...COMPONENTS.sectionTitle,
  },
  content: {
    marginTop: SPACING.md,
  },
}

export const Section = ({ title, children }) => {
  return View({ style: STYLES.container }, [
    title && Text({ style: STYLES.title }, title),
    View({ style: STYLES.content }, children),
  ])
}
