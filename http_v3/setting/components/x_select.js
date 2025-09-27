// Default ZeppOS does not show selected value itialy. But this one does.

export const xSelect = ({ value = [], options = [], ...props }) => {
  const label = options.filter(o => value.includes(o.value)).map(o => o.name).join(', ')
  return View({ style: { position: 'relative' } }, [
    Select({ value, options, ...props }),
    Text({ style: VALUE }, label || 'N/A')
  ])
}

const VALUE = {
  fontSize: '16px',
  position: 'absolute',
  left: '0',
  pointerEvents: 'none',
  fontWeight: '400',
  bottom: '7px',
}
