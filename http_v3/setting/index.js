import { BODY, MAIN, CARD, BUTTON, RAW } from './styles.js'
import { Card } from './components/card.js'
import { Config } from './components/config.js'
import { H1 } from './components/h1.js'
import { initStore } from './store.js'

const DEFAULT_SETTINGS = {
  output: 'toast', // toast, alert, notification
  vibrate: ['success', 'error'], // success, error
  close: ['success', 'error'], // success, error
  awaken: false,
}

AppSettingsPage({
  state: {},

  build({ settingsStorage }) {
    const actions = JSON.parse(settingsStorage.getItem('actions') || '[{}]')

    const store = initStore(settingsStorage)

    const update = () => settingsStorage.setItem('actions', JSON.stringify(actions))
    const save = (i, name, value) => {
      actions[i][name] = value
      update()
    }

    const remove = (i) => actions.pop(i) && update()
    const sort = (i) => {
      if (i < 1) return
      [actions[i], actions[i-1]] = [actions[i-1], actions[i]]
      update()
    }

    const Actions = View( {}, actions.map((action, i) => { return Card({ action, i, save, remove, sort, store }) }))

    return View({ style: BODY }, [
      View({ style: MAIN }, [
        H1('Settings'),
        Config({ config: {}, save: () => {} }),
        H1('Actions'),
        Actions,

        Button({
          label: '+',
          style: BUTTON,
          onClick: () => { actions.push({}) && update() }
        }),
      ]),

      Toast({
        message: store.result,
        visible: !!store.result,
        duration: 2000,
      }),
    ])
  }
})
