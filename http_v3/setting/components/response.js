import { Input } from './input.js'

export const Response = ({ action, i, save }) => {
  return View({}, [
    Toggle({
      label: '✂️ Parse JSON response',
      value: action.json,
      onChange: value => { save(i, 'json', value) },
    }),

    action.json && View({}, [
      Text({ paragraph: true, style: SMALL }, "Use dot notation to navigate the JSON structure."),
      Input({
        label: '✅ Success Key',
        placeholder: 'data.0.result',
        value: action.key,
        onChange: value => { save(i, 'success_key', value) },
      }),

      Input({
        label: '❌ Error Key',
        placeholder: 'data.error.message',
        value: action.key,
        onChange: value => { save(i, 'error_key', value) },
      }),
    ])
  ])
}

const SMALL = {
  fontSize: 12,
}
