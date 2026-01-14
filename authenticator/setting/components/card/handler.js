const STYLE = {
  background: 'transparent',
  backgroundColor: 'transparent',
  border: 'none',
  borderRadius: '0',
  boxShadow: 'none',
  outline: 'none',
  color: '#6e7377',
  fontSize: '36px',
  padding: '0',
  margin: '0',
  minWidth: 'auto',
  minHeight: 'auto',
  cursor: 'grab',
  pointerEvents: 'all',
  touchAction: 'none',
  flexShrink: 0,
}

export const Handler = () => {
  return View({ style: STYLE }, [
    Text({}, '≡'),
  ])
}
