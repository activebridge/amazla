import { COMPONENTS, TYPOGRAPHY, COLORS, SPACING } from '../styles.js'

const STYLES = {
  container: {
    ...COMPONENTS.card,
    padding: SPACING.lg,
  },
  header: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'pointer',
    userSelect: 'none',
  },
  title: {
    ...TYPOGRAPHY.cardTitle,
    flex: '1',
  },
  toggle: {
    fontSize: '20px',
    color: COLORS.accent,
    fontWeight: 'bold',
  },
  content: {
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTop: `1px solid ${COLORS.border}`,
  },
  text: {
    ...TYPOGRAPHY.body,
  },
}

export class ExpandableCard {
  constructor(props) {
    this.props = props
    this.state = { isExpanded: false }
  }

  toggle() {
    this.state.isExpanded = !this.state.isExpanded
    this.props.onToggle?.(this.state.isExpanded)
  }

  render() {
    const { title, content } = this.props
    const { isExpanded } = this.state

    return View({ style: STYLES.container }, [
      View({
        style: STYLES.header,
        onClick: () => this.toggle(),
      }, [
        Text({ style: STYLES.title }, title),
        Text({ style: STYLES.toggle }, isExpanded ? '−' : '+'),
      ]),
      isExpanded && View({ style: STYLES.content }, [
        Text({ style: STYLES.text, paragraph: true }, content),
      ]),
    ])
  }
}

export const ExpandableCardView = ({ title, content, state = { isExpanded: false }, onToggle }) => {
  return View({
    style: STYLES.container,
  }, [
    View({
      style: STYLES.header,
      onClick: () => {
        state.isExpanded = !state.isExpanded
        onToggle?.(state.isExpanded)
      },
    }, [
      Text({ style: STYLES.title }, title),
      Text({ style: STYLES.toggle }, state.isExpanded ? '−' : '+'),
    ]),
    state.isExpanded && View({ style: STYLES.content }, [
      Text({ style: STYLES.text, paragraph: true }, content),
    ]),
  ])
}
