// Default ZeppOS does not show selected value itialy. But this one does.

import { INPUT_LABEL_STYLE, INPUT_STYLE } from '../styles.js'

export const xSelect = ({ value = [], options = [], label, ...props }) => {
  const selectedValue = options.find(o => value.includes(o.value))?.name
  return View({}, [
    label && Text({ style: INPUT_LABEL_STYLE }, label),
    View({
      style: {
        ...INPUT_STYLE,
        width: 'fit-content',
        padding: '1px 16px',
      }
    }, [
      Select({ value, options, ...props }),
      Text({ style: VALUE }, selectedValue || 'N/A')
    ])
  ])
}

const VALUE = {
  fontSize: '16px',
  position: 'absolute',
  left: '16px',
  pointerEvents: 'none',
  fontWeight: '400',
  bottom: '7px',
  letterSpacing: '0.00938em',
  fontFamily: "Nerd,Circular,Helvetica,Arial,sans-serif",
}
