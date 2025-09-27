import { BODY, CARD, BUTTON, RAW } from './styles.js'
import { Card } from './components/card.js'
import { H1 } from './components/h1.js'

AppSettingsPage({
  state: {},

  build(props) {
    const actions = JSON.parse(props.settingsStorage.getItem('actions') || '[{}]')

    const update = () => props.settingsStorage.setItem('actions', JSON.stringify(actions))
    const save = (i, name, value) => (actions[i][name] = value) && update()
    const remove = (i) => actions.pop(i) && update()

    const Actions = View( {}, actions.map((action, i) => { return Card({ action, i, save, remove}) }))

    return View({ style: BODY },
      [
        H1('Actions'),
        Actions,

        Button({
          label: '+',
          style: BUTTON,
          onClick: () => { actions.push({}) && update() }
        }),

        H1('Settings'),

        Text({ style: { color: 'transparent' } }, 'Spacer'),
      ],
    )
  },
})
