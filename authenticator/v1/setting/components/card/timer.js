const style = (degrees, isLow) => ({
  width: '32px',
  height: '32px',
  minWidth: '32px',
  minHeight: '32px',
  flexShrink: 0,
  borderRadius: '50%',
  background: `conic-gradient(${isLow ? '#f28b82' : '#8ab4f8'} ${degrees}deg, #252525 ${degrees}deg)`,
  boxShadow: `inset 2px 2px 4px #000, inset -1px -1px 3px #333, 0 0 12px ${isLow ? 'rgba(242, 139, 130, 0.5)' : 'rgba(138, 180, 248, 0.4)'}`,
})

export const Timer = (degrees, isLow) => {
  return View({ style: style(degrees, isLow) }, [])
}
