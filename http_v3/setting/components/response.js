import { Input } from './input.js'

export const Response = ({ action: { json, successKey, errorKey }, i, save }) => {
  return View({}, [
    Toggle({
      label: '✂️ Parse JSON response',
      value: json,
      onChange: value => { save(i, 'json', value) },
    }),

    json && View({}, [
      Text({ paragraph: true, style: SMALL }, "Use dot notation to navigate the JSON structure."),
      Input({
        label: '✅ Success Key',
        placeholder: 'data.0.result',
        value: successKey,
        onChange: value => { save(i, 'successKey', value) },
      }),

      Input({
        label: '❌ Error Key',
        placeholder: 'data.error.message',
        value: errorKey,
        onChange: value => { save(i, 'errorKey', value) },
      }),
    ])
  ])
}

const SMALL = {
  fontSize: 12,
}
