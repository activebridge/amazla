const CONTAINER = {
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
}

// The card color is user-picked, so light text can land on a light background.
// A dark shadow down-right keeps it legible on any color; no light highlight —
// at text sizes it reads as blur rather than an engraved edge.
const SHADOW = '1px 1px 1px rgba(0, 0, 0, 0.85)'

const NAME = {
  fontSize: '19px',
  color: '#e8eaed',
  textShadow: SHADOW,
  margin: '0 0 4px 0',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const CODE = {
  // Sized and dimmed to sit under the name: mono white at 16px/78% read heavier
  // than the 19px name and inverted the hierarchy.
  fontSize: '15px',
  // Was #9aa0a6, which fell apart on the light half of the palette (yellow,
  // orange). White holds on every card color the shadow already covers.
  color: 'rgba(255, 255, 255, 0.68)',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  letterSpacing: '0.5px',
  textShadow: SHADOW,
  margin: '0',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

// Membership numbers are printed in groups, never as one run of digits. Groups
// of four from the right, with a remainder of one or two digits absorbed into
// the leading group rather than left to stand alone: a 13-digit code reads
// "12345 6789 0128", not "1 2345 6789 0128". A remainder of three is a group in
// its own right. Only all-digit codes get grouped — a Code 39 string or a QR URL
// reads worse broken up, and the code stays exactly as typed everywhere it
// matters.
const grouped = (code) => {
  const src = String(code || '')
  if (!/^\d{8,}$/.test(src)) return src
  const remainder = src.length % 4
  const lead = remainder === 1 || remainder === 2 ? remainder + 4 : remainder
  const rest = src.slice(lead).match(/\d{4}/g) || []
  return (lead ? [src.slice(0, lead), ...rest] : rest).join(' ')
}

export const Body = (card) => {
  return View({ style: CONTAINER }, [
    Text({ paragraph: true, style: NAME }, card.title || 'Untitled'),
    Text({ paragraph: true, style: CODE }, grouped(card.displayCode) || '—'),
  ])
}
