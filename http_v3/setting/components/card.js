import { CARD, BUTTON, REMOVE_BUTTON, SORT_BUTTON } from '../styles.js'
import { xSelect } from './x_select.js'
import { Input } from './input.js'
import { Hr } from './hr.js'

const METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].map(m => ({ name: m, value: m }))
const ICONS = ['▶', '★', '☎', '⚠', '☯', '♨', '♻'].map(i => ({ name: i, value: i }))

export const Card = ({ action, i, save, remove, sort }) => {
  return Section({ style: CARD }, [
    Button({
      label: '×',
      style: REMOVE_BUTTON,
      onClick: () => { remove(i) }
    }),

    Button({
      label: '↑',
      style: SORT_BUTTON,
      onClick: () => { sort && sort(i) }
    }),

    Input({
      label: 'Title',
      placeholder: 'Run',
      value: action.title,
      onChange: value => { save(i, 'title', value) },
    }),

    Hr(),

    xSelect({
      label: 'Icon',
      options: ICONS,
      value: action.icon,
      onChange: value => { save(i, 'icon', value) },
    }),

    Hr(),

    Input({
      label: 'URL',
      placeholder: 'https://api.url.com',
      value: action.url || 'https://',
      onChange: value => { save(i, 'url', value) },
    }),

    Hr(),

    xSelect({
      label: 'Method',
      options: METHODS,
      multiple: false,
      value: action.method,
      onChange: value => { save(i, 'method', value) },
    }),

    Hr(),

    Input({
      label: 'Headers',
      placeholder: 'Authorization=Token\nAnother header=value',
      value: action.headers,
      multiline: true,
      rows: 3,
      onChange: value => { save(i, 'headers', value) },
    }),

    Hr(),

    Input({
      label: 'Body',
      placeholder: 'key=value',
      value: action.body,
      multiline: true,
      rows: 3,
      onChange: value => { save(i, 'body', value) },
    })
  ])
}
