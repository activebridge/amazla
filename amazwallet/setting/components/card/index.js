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
// to black (keeps the name/code readable on light colors). Kept shallow — at 50%
// every card dimmed into the page background and the palette lost its punch.
const cardBackground = (color) => {
  const base = color != null ? hex(color) : '#000000'
  return `linear-gradient(transparent, rgba(0, 0, 0, 0.32)), ${base}`
}

// A decorative code on the right end — the detail that reads "loyalty card"
// instead of "colored list row". One rounded white label; the marks ride on it
// as a centered background, inset on every side so the label keeps its quiet
// zone, the way a code is actually printed.
const MARK = 'rgba(0, 0, 0, 0.82)'

// Both marks share one 44x44 label, centered on the card — a QR has to be
// square, and a bar label of a different height next to it looks like a mistake.
const LABEL = {
  position: 'absolute',
  // Sits left of the keyring hole, which keeps the right edge to itself.
  right: '34px',
  top: '50%',
  transform: 'translateY(-50%)',
  width: '44px',
  height: '44px',
  borderRadius: '5px',
  backgroundColor: 'rgba(255, 255, 255, 0.92)',
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'center',
  // Pressed into the card, same neumorphic language as the search field: a dark
  // inset from the top-left where the light is blocked, a light one from the
  // bottom-right where it pools. The outer shadow stays hairline so the label
  // reads as recessed, not raised.
  boxShadow:
    'inset 2px 2px 4px rgba(0, 0, 0, 0.30),' +
    ' inset -2px -2px 4px rgba(255, 255, 255, 0.85),' +
    ' 0 1px 1px rgba(0, 0, 0, 0.25)',
  pointerEvents: 'none',
}

// Bars from one repeating gradient, 11px period, three uneven widths so it does
// not read as a picket fence.
const BARCODE = {
  ...LABEL,
  backgroundImage:
    `repeating-linear-gradient(90deg,` +
    ` ${MARK} 0 2px, transparent 2px 5px,` +
    ` ${MARK} 5px 6px, transparent 6px 8px,` +
    ` ${MARK} 8px 9px, transparent 9px 11px)`,
  backgroundSize: 'calc(100% - 12px) calc(100% - 16px)',
}

// QR cards get a QR glyph instead: three finder rings, a timing row and a
// scatter of modules. A gradient can't punch the hole in a finder ring, so this
// one mark is an inline SVG.
const QR_SVG =
  `%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 21 21' fill='black' fill-opacity='0.82'%3E` +
  `%3Cpath fill-rule='evenodd' d='M0 0h7v7H0zM1 1v5h5V1z'/%3E%3Crect x='2' y='2' width='3' height='3'/%3E` +
  `%3Cpath fill-rule='evenodd' d='M14 0h7v7h-7zM15 1v5h5V1z'/%3E%3Crect x='16' y='2' width='3' height='3'/%3E` +
  `%3Cpath fill-rule='evenodd' d='M0 14h7v7H0zM1 15v5h5v-5z'/%3E%3Crect x='2' y='16' width='3' height='3'/%3E` +
  `%3Cpath d='M8 0h1v3H8zM10 1h1v2h-1zM12 0h1v1h-1z'/%3E` +
  `%3Cpath d='M0 8h3v1H0zM1 10h2v1H1zM0 12h1v1H0z'/%3E` +
  `%3Cpath d='M8 6h1v1H8zM10 6h1v1h-1zM12 6h1v1h-1zM6 8h1v1H6zM6 10h1v1H6zM6 12h1v1H6z'/%3E` +
  `%3Cpath d='M9 9h2v2H9zM12 8h1v1h-1zM14 9h1v1h-1zM16 8h2v1h-2zM19 9h1v2h-1z'/%3E` +
  `%3Cpath d='M8 12h1v1H8zM11 12h2v1h-2zM14 12h1v2h-1zM17 12h1v1h-1zM19 13h1v1h-1z'/%3E` +
  `%3Cpath d='M9 15h1v1H9zM11 14h1v2h-1zM13 16h2v1h-2zM16 15h1v2h-1zM18 16h1v1h-1zM20 15h1v1h-1z'/%3E` +
  `%3Cpath d='M8 18h2v1H8zM11 19h1v1h-1zM13 18h1v2h-1zM15 19h2v1h-2zM18 18h1v1h-1zM20 19h1v1h-1z'/%3E` +
  `%3C/svg%3E`
const QR = {
  ...LABEL,
  backgroundImage: `url("data:image/svg+xml,${QR_SVG}")`,
  backgroundSize: 'calc(100% - 12px) calc(100% - 12px)',
}

const Mark = (type) => View({ style: type === 'qr' ? QR : BARCODE }, [])

// A single diagonal sheen, the light catching a glossy card. This replaced two
// dark corner blobs: at this card size they overlapped into something that read
// as a smudge on the plastic rather than as shading. Painted on the swiping
// content, not the card frame, so it travels with the text and the dot.
const SHEEN =
  'linear-gradient(115deg,' +
  ' transparent 28%,' +
  ' rgba(255, 255, 255, 0.16) 44%,' +
  ' rgba(255, 255, 255, 0.16) 50%,' +
  ' transparent 64%)'

// The engraved keyring hole from the watch card: a black hole with a light
// crescent peeking out below it. Top-right corner, clear of the drag handle on
// the left; the code label drops below it rather than sharing the corner.
const DOT = {
  position: 'absolute',
  right: '13px',
  top: '11px',
  width: '13px',
  height: '13px',
  borderRadius: '50%',
  background: '#000000',
  boxShadow: '0 2px 0 rgba(206, 206, 206, 0.8), inset 1px 1px 2px rgba(0, 0, 0, 0.9)',
  pointerEvents: 'none',
}


const BODY_WRAPPER = {
  display: 'flex',
  flexDirection: 'row',
  overflowX: 'auto',
  overflowY: 'hidden',
  scrollSnapType: 'x mandatory',
  scrollbarWidth: 'none',
  alignItems: 'stretch',
  // No -webkit-overflow-scrolling: touch. On iOS it promotes this scroller to
  // its own compositing layer, and a promoted layer escapes its overflow clip
  // and paints over position: fixed content — the delete buttons showed through
  // the help dialog. Momentum scrolling is the default in iOS 13+ anyway.
  overscrollBehaviorX: 'none',
  width: '100%',
}

const BODY_CONTENT = {
  display: 'flex',
  // Positioned so the dot anchors to the swiping content, not the card frame.
  position: 'relative',
  flexDirection: 'row',
  alignItems: 'center',
  gap: '8px',
  flexShrink: 0,
  width: '100%',
  paddingLeft: '10px',
  // Room for the code label (34 inset + 44 wide) plus a gap, so a long name
  // ellipsizes before it reaches the label instead of running under it.
  paddingRight: '90px',
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
  return View({ style: { ...CARD, background: cardBackground(card.color) } }, [
    View({ style: BODY_WRAPPER }, [
      View({ style: { ...BODY_CONTENT, background: SHEEN } }, [
        View({ style: DOT }, []),
        Mark(card.type),
        Handler(),
        View({ style: CLICK_AREA, onClick: (e) => openCardDialog(e, card.index) }, [
          Body(card),
        ]),
      ]),
      DeleteButton(card),
    ]),
  ])
}
