import { Handler } from './handler.js'
import { Body } from './body.js'
import { DeleteButton } from './delete_button.js'
import { openCardDialog } from '../../libs/editDialog.js'

const CARD = {
  position: 'relative',
  overflow: 'hidden',
  scrollSnapAlign: 'start',
  maxHeight: '120px',
  opacity: 1,
  marginBottom: '12px',
  borderRadius: '16px',
  // Embossed like the watch card: dropped shadow below-right, faint lift above-
  // left, and a light top edge where the light would catch it.
  boxShadow:
    '4px 6px 10px rgba(0, 0, 0, 0.8), -2px -2px 6px #1a1a1a, inset 0 1px 0 rgba(206, 206, 206, 0.45)',
}

const hex = (n) => '#' + Number(n || 0).toString(16).padStart(6, '0')

// Card color as background, with a top→bottom overlay fading from transparent
// to 50% black (keeps the name/code readable on light colors).
const cardBackground = (color) => {
  const base = color != null ? hex(color) : '#000000'
  return `linear-gradient(transparent, rgba(0, 0, 0, 0.5)), ${base}`
}

// The watch card's two dark blobs, hugging the bottom corner opposite the dot.
// Radii there are 0.7 and 0.35 of the card height (~84px here), each centered
// 0.35 of a radius in from the corner so they only darken it. This paints on the
// swiping content, not the card frame, so it travels with the text and the dot.
const blobs = (index) => {
  const side = index % 2 === 0 ? '100%' : '0%' // corner opposite the dot
  const at = (inset) => `calc(${side} ${index % 2 === 0 ? '-' : '+'} ${inset}px) calc(100% - ${inset}px)`
  return (
    `radial-gradient(circle 29px at ${at(10)}, rgba(0, 0, 0, 0.22) 100%, transparent 100%), ` +
    `radial-gradient(circle 59px at ${at(21)}, rgba(0, 0, 0, 0.16) 100%, transparent 100%)`
  )
}

// The engraved dot from the watch card: a black hole with a light crescent
// peeking out below it. Alternates corners with the index, same as the watch.
const DOT = {
  position: 'absolute',
  top: '14px',
  width: '14px',
  height: '14px',
  borderRadius: '50%',
  background: '#000000',
  boxShadow: '0 2px 0 rgba(206, 206, 206, 0.8), inset 1px 1px 2px rgba(0, 0, 0, 0.9)',
  pointerEvents: 'none',
}

const dotStyle = (index) => ({
  ...DOT,
  ...(index % 2 === 0 ? { left: '14px' } : { right: '14px' }),
})


const BODY_WRAPPER = {
  display: 'flex',
  flexDirection: 'row',
  overflowX: 'auto',
  overflowY: 'hidden',
  scrollSnapType: 'x mandatory',
  scrollbarWidth: 'none',
  alignItems: 'stretch',
  WebkitOverflowScrolling: 'touch',
  overscrollBehaviorX: 'none',
  width: '100%',
}

const BODY_CONTENT = {
  display: 'flex',
  // Positioned so the dot anchors to the swiping content, not the card frame.
  position: 'relative',
  flexDirection: 'row',
  alignItems: 'center',
  gap: '12px',
  flexShrink: 0,
  width: '100%',
  paddingLeft: '20px',
  paddingRight: '20px',
  boxSizing: 'border-box',
  scrollSnapAlign: 'start',
  paddingTop: '16px',
  paddingBottom: '16px',
}

const CLICK_AREA = {
  flex: 1,
  minWidth: 0,
  cursor: 'pointer',
}

export const Card = (card) => {
  const index = Number(card.index) || 0
  return View({ style: { ...CARD, background: cardBackground(card.color) } }, [
    View({ style: BODY_WRAPPER }, [
      View({ style: { ...BODY_CONTENT, background: blobs(index) } }, [
        View({ style: dotStyle(index) }, []),
        Handler(),
        View({ style: CLICK_AREA, onClick: (e) => openCardDialog(e, card.index) }, [
          Body(card),
        ]),
      ]),
      DeleteButton(card),
    ]),
  ])
}
