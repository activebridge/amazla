import { resetCardScrollPositions } from '../libs/dom.js'
import { DELETE_BUTTON, ROW_GAP, ROW_MAX_HEIGHT } from '../styles.js'

const findRow = (el) => {
  // Button → ROW_WRAPPER → ROW
  const row = el?.parentElement?.parentElement
  return row?.tagName !== 'BODY' ? row : null
}

export const DeleteButton = (action) => {
  return Button({
    style: DELETE_BUTTON,
    label: '✕',
    onClick: (e) => {
      const el = findRow(e.currentTarget)
      if (el) {
        const scrollable = el.querySelector('[style*="overflow"]')
        if (scrollable) scrollable.scrollTo({ left: 0, behavior: 'smooth' })

        el.style.transition = 'max-height 0.3s ease, opacity 0.3s ease, margin 0.3s ease'
        el.offsetHeight // force reflow
        el.style.maxHeight = '0px'
        el.style.opacity = '0'
        el.style.marginBottom = '0px'
      }

      // React reuses this DOM node for whatever row takes this position next,
      // so the collapsed styles have to come off before the list re-renders.
      setTimeout(() => {
        if (el) {
          el.style.maxHeight = ROW_MAX_HEIGHT
          el.style.opacity = '1'
          el.style.marginBottom = ROW_GAP
          el.style.transition = ''
        }
        action.delete()
        setTimeout(resetCardScrollPositions, 50)
      }, 300)
    },
  })
}
