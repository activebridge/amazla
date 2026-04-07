import { COMPONENTS, TYPOGRAPHY, COLORS, SPACING } from '../styles.js'

const STYLES = {
  container: {
    ...COMPONENTS.card,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.lg,
  },
  number: {
    ...COMPONENTS.stepNumber,
  },
  content: {
    flex: '1',
  },
  title: {
    ...TYPOGRAPHY.cardTitle,
    marginBottom: SPACING.sm,
  },
  description: {
    ...TYPOGRAPHY.body,
    marginBottom: SPACING.sm,
  },
  icon: {
    fontSize: '20px',
    marginRight: SPACING.sm,
  },
}

export const InstructionStep = ({ number, title, description, icon = '' }) => {
  return View({ style: STYLES.container }, [
    View({ style: STYLES.number }, [
      Text({}, String(number)),
    ]),
    View({ style: STYLES.content }, [
      Text({ style: STYLES.title }, `${icon} ${title}`),
      Text({ style: STYLES.description, paragraph: true }, description),
    ]),
  ])
}
