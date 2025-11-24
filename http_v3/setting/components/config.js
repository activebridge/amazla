import { CARD } from '../styles.js'
import { xSelect } from './x_select.js'
import { Hr } from './hr.js'
import { Br } from './br.js'

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

  return Section({ style: CARD }, [
    xSelect({
      label: '⌚ № of Buttons per Page',
      options: BUTTONS,
      value: [config.buttons],
      onChange: value => { config.buttons = value },
    }),
    Br(),
    xSelect({
      label: '👀 Result Display (Alert is not available for Widget)',
      options: OUTPUTS,
      value: config.output,
      onChange: value => { config.output = value },
    }),
    Hr(),
    xSelect({
      label: '🔘 Button Press Action (Long Press to exit)',
      options: options,
      value: config.press,
      onChange: value => { config.press = value },
    }),
    Hr(),
    Toggle({
      label: '💡 Keep Screen On',
      value: config.awake,
      onChange: value => { config.awake = value },
    }),
    Br(),
    Toggle({
      label: '🔚 Exit on Success',
      value: config.exit,
      onChange: value => { config.exit = value },
    }),
    // Br(),
    // xSelect({
    //   label: '🔘 Button Double Press Action',
    //   options: options,
    //   value: config.double,
    //   onChange: value => { config.double = value },
    // }),
  ])
}
