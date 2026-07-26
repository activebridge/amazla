const STYLE = {
  color: '#6e7377',
  // Same engraved shadow as the card text — the handle sits on the card color too.
  textShadow: '1px 1px 1px rgba(0, 0, 0, 0.85), -1px -1px 1px rgba(255, 255, 255, 0.35)',
  fontSize: '28px',
  flexShrink: 0,
  cursor: 'grab',
  touchAction: 'none',
  padding: '0 4px',
}

// The sortable lib finds cards/handles by this '≡' text — keep it.
export const Handler = () => {
  return View({ style: STYLE }, [
    Text({}, '≡'),
  ])
}
