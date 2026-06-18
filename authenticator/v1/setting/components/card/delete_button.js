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
  color: 'white',
}

const findCard = (el) => {
  // Button → BODY_WRAPPER → Card (2 levels up)
  const card = el?.parentElement?.parentElement
  return card?.tagName !== 'BODY' ? card : null
}

export const DeleteButton = (account) => {
  return Button({
    style: STYLE,
    label: '✕',
    onClick: (e) => {
      const card = findCard(e.currentTarget)
      if (card) {
        // Scroll card to left smoothly
        const scrollable = card.querySelector('[style*="overflow"]')
        if (scrollable) scrollable.scrollTo({ left: 0, behavior: 'smooth' })

        // Enable transition, then hide
        card.style.transition = 'max-height 0.3s ease, opacity 0.3s ease, margin 0.3s ease'
        card.offsetHeight // force reflow
        card.style.maxHeight = '0px'
        card.style.opacity = '0'
        card.style.marginBottom = '0px'
      }

      // Delete after animation
      setTimeout(() => {
        // Reset to original values before delete
        if (card) {
          card.style.maxHeight = '200px'
          card.style.opacity = '1'
          card.style.marginBottom = '12px'
          card.style.transition = ''
        }
        account.delete()
        setTimeout(resetCardScrollPositions, 50)
      }, 300)
    },
  })
}
