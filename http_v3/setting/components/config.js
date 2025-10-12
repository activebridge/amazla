import { CARD } from '../styles.js'
import { xSelect } from './x_select.js'
import { Hr } from './hr.js'

const OUTPUTS = [
  { name: 'Toast', value: 'toast' },
  { name: 'Notification', value: 'notification' },
  { name: 'Alert', value: 'alert' },
]

export const Config = (config) => {
  return Section({ style: CARD }, [
    xSelect({
      label: '👀 Result Display',
      options: OUTPUTS,
      value: config.output,
      onChange: value => { config.output = value },
    }),
    Hr(),
    Toggle({
      label: '💡 Keep Screen On',
      value: config.awake,
      onChange: value => { config.awake = value },
    }),
    Hr(),
    Toggle({
      label: '🔚 Exit on Success',
      value: config.exit,
      onChange: value => { config.exit = value },
    }),
  ])
}
