import { CARD, BUTTON, REMOVE_BUTTON, SORT_BUTTON } from '../styles.js'
import { xSelect } from './x_select.js'
import { Input } from './input.js'
import { Hr } from './hr.js'
import { Response } from './response.js'
import { Runner } from './runner.js'

const METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].map(m => ({ name: m, value: m }))

const ICONS = [
  '•', '★', '☆', '☉', '☏', '☜', '☞', '☟', '♡', '♢', '♤', '♧', '♪',
  '♫', '♬', '♲', '♳', '♴', '♵', '♶', '♷', '♸', '♹',
  '♺', '♼', '♽', '✓', '✚', '✽', '℻', '☖', '☗',
  '✿', '❀', '❖', '❶', '❷', '❸', '❹', '❺', '❻', '❼',
  '❽', '❾', '❿', '℀', '℃', '℉', 'Ω', '℧', 'ℵ',
].map(i => ({ name: i, value: i }))

export const Card = ({ action, index, store }) => {
  return Section({ style: CARD }, [
    Button({
      label: '×',
      style: REMOVE_BUTTON,
      onClick: () => { action.delete() }
    }),

    Button({
      label: '↑',
      style: SORT_BUTTON,
      onClick: () => { action.moveUp() }
    }),

    Input({
      label: '✏️Title',
      placeholder: 'Run',
      value: action.title,
      onChange: value => { action.title = value },
    }),

    Hr(),

    xSelect({
      label: '🖼️ Icon',
      options: ICONS,
      multiple: false,
      value: action.icon,
      onChange: value => { action.icon = value },
    }),

    Hr(),

    Input({
      label: '🔗 URL',
      placeholder: 'https://api.url.com',
      value: action.url,
      onChange: value => { action.url = value },
    }),

    Hr(),

    xSelect({
      label: '⚙️ Method',
      options: METHODS,
      multiple: false,
      value: action.method,
      onChange: value => { action.method = value },
    }),

    Hr(),

    Input({
      label: '👤 Headers',
      placeholder: 'Authorization=Token\nAnother header=value',
      value: action.headers,
      multiline: true,
      rows: 3,
      onChange: value => { action.headers = value },
    }),

    Hr(),

    Input({
      label: '📄 Body',
      placeholder: 'key=value',
      value: action.body,
      multiline: true,
      rows: 3,
      onChange: value => { action.body = value },
    }),

    Hr(),
    Response(action),
    Runner(action, store),
  ])
}
