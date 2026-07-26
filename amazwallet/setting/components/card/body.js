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
  fontSize: '16px',
  color: '#9aa0a6',
  textShadow: SHADOW,
  margin: '0',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

export const Body = (card) => {
  return View({ style: CONTAINER }, [
    Text({ paragraph: true, style: NAME }, card.title || 'Untitled'),
    Text({ paragraph: true, style: CODE }, card.displayCode || '—'),
  ])
}
