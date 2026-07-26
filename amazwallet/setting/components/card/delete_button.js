import { resetCardScrollPositions } from '../../libs/dom.js'

const STYLE = {
  background: 'linear-gradient(145deg, #e63428, #c22b20)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 24px',
  flexShrink: 0,
  scrollSnapAlign: 'end',
  cursor: 'pointer',
  alignSelf: 'stretch',
  marginTop: '-16px',
  marginBottom: '-16px',
  fontSize: '24px',
  color: '#f0c2bc',
  textShadow: '1px 1px 1px rgba(0, 0, 0, 0.85), -1px -1px 1px rgba(255, 255, 255, 0.35)',
}

const findCard = (el) => {
  // Button → BODY_WRAPPER → Card
  const card = el?.parentElement?.parentElement
  return card?.tagName !== 'BODY' ? card : null
}

export const DeleteButton = (card) => {
  return Button({
    style: STYLE,
    label: '✕',
    onClick: (e) => {
      const el = findCard(e.currentTarget)
      if (el) {
        const scrollable = el.querySelector('[style*="overflow"]')
        if (scrollable) scrollable.scrollTo({ left: 0, behavior: 'smooth' })

        el.style.transition = 'max-height 0.3s ease, opacity 0.3s ease, margin 0.3s ease'
        el.offsetHeight // force reflow
        el.style.maxHeight = '0px'
        el.style.opacity = '0'
        el.style.marginBottom = '0px'
      }

      setTimeout(() => {
        if (el) {
          el.style.maxHeight = '120px'
          el.style.opacity = '1'
          el.style.marginBottom = '12px'
          el.style.transition = ''
        }
        card.delete()
        setTimeout(resetCardScrollPositions, 50)
      }, 300)
    },
  })
}
