import { Input } from './input.js'

export const Response = (action) => {
  return View({}, [
    Toggle({
      label: '✂️ Parse JSON response',
      value: action.json,
      onChange: value => { action.json = value },
    }),

    action.json && View({}, [
      Text({ paragraph: true, style: SMALL }, "Use dot notation to navigate the JSON structure."),
      Input({
        label: '✅ Success Key',
        placeholder: 'data.0.result',
        value: action.successKey,
        onChange: value => { action.successKey = value },
      }),

      Input({
        label: '❌ Error Key',
        placeholder: 'data.error.message',
        value: action.errorKey,
        onChange: value => { action.errorKey = value },
      }),
    ])
  ])
}

const SMALL = {
  fontSize: 12,
}
