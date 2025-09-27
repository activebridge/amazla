import { CARD, BUTTON } from '../styles.js'
import { xSelect } from './x_select.js'

const METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].map(m => ({ name: m, value: m }))
const ICONS = ['▶', '★', '☎', '⚠', '☯', '♨', '♻'].map(i => ({ name: i, value: i }))

export const Card = ({ action, i, save, remove }) => {
  return Section({ style: CARD }, [
    TextInput({
      label: 'Title',
      placeholder: 'Run',
      value: action.title,
      subStyle: { color: 'white' },
      onChange: value => { save(i, 'title', value) },
    }),

    xSelect({
      label: 'Icon',
      options: ICONS,
      value: action.icon,
      onChange: value => { save(i, 'icon', value) },
    }),

    TextInput({
      label: 'URL',
      placeholder: 'https://api.url.com',
      value: action.url || 'https://',
      onChange: value => { save(i, 'url', value) },
    }),

    xSelect({
      label: 'METHOD',
      options: METHODS,
      multiple: false,
      value: action.method,
      onChange: value => { save(i, 'method', value) },
    }),

    TextInput({
      label: 'Headers',
      placeholder: 'Authorization=Token\nAnother header=value',
      value: action.headers,
      rows: 3,
      multiline: true,
      onChange: value => { save(i, 'headers', value) },
    }),

    TextInput({
      label: 'Body',
      labelStyle: {
        marginTop: '20px',
      },
      placeholder: 'key=value',
      value: action.body,
      multiline: true,
      rows: 3,
      onChange: value => { save(i, 'body', value) },
    }),

    Button({
      label: '×',
      style: BUTTON,
      onClick: () => { remove(i) }
    })
  ])
}
