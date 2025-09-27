export const IconSelect = ({ action, onChange }) => {
  return Select({
    options: [
      { value: '▶', name: '▶' },
      { value: '★', name: '★' },
      { value: '☎', name: '☎' },
      { value: '⚠', name: '⚠' },
      { value: '☯', name: '☯' },
      { value: '♨', name: '♨' },
      { value: '♻', name: '♻' },
    ],
    multiple: false,
    value: action.icon || '▶',
    onChange: onChange,
  })
}

export const xSelect = ({ value, options, ...props }) => {
  return View({ style: { position: 'relative' } }, [
    Select({ value, options, ...props }),
    Text({ style: VALUE }, options.find(o => o.value == value)?.name || 'N/A')
  ])
}

const VALUE = {
  fontSize: '16px',
  position: 'absolute',
  left: '0',
  pointerEvents: 'none',
  fontWeight: '400',
  top: '50%',
  transform: 'translateY(-50%)',
}
