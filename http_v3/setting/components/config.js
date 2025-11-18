import { CARD } from '../styles.js'
import { xSelect } from './x_select.js'
import { Hr } from './hr.js'

const OUTPUTS = [
  { name: '🍞 Toast', value: 'toast' },
  { name: '🔔 Notification', value: 'notification' },
  { name: '💬 Alert', value: 'alert' },
]

const BUTTONS = [
  { name: '1️⃣', value: 1 },
  { name: '2️⃣', value: 2 },
  { name: '3️⃣', value: 3 },
  { name: '4️⃣', value: 4 },
]

export const Config = (config, actions) => {
  const options = actions.map(a => ({ name: a.title, value: a.id }))
  console.log(actions)

  return Section({ style: CARD }, [
    xSelect({
      label: '⌚ № of Buttons per Page',
      options: BUTTONS,
      value: [config.buttons],
      onChange: value => { config.buttons = value },
    }),
    Hr(),
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
    Hr(),
    xSelect({
      label: '🔘 Button Long Press Action',
      options: options,
      value: config.long,
      onChange: value => { config.long = value },
    }),
    xSelect({
      label: '🔘 Button Double Press Action',
      options: options,
      value: config.double,
      onChange: value => { config.double = value },
    }),
    xSelect({
      label: '⌚ Primary Widget Action',
      options: options,
      value: config.widget,
      onChange: value => { config.widget = value },
    }),
    xSelect({
      label: '⌚ Secondary Widget Action',
      options: options,
      value: config.secondary,
      onChange: value => { config.secondary = value },
    }),
  ])
}
