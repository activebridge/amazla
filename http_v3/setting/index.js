import { BODY, MAIN, CARD, BUTTON, RAW } from './styles.js'
import { Card } from './components/card.js'
import { Config } from './components/config.js'
import { H1 } from './components/h1.js'
import { initStore } from './store.js'

AppSettingsPage({
  state: {},

  build({ settingsStorage }) {
    const store = initStore(settingsStorage)
    const { actions, config } = store

    return View({ style: BODY }, [
      View({ style: MAIN }, [
        H1('⚙️ Settings'),
        Config(config),
        H1('🌎 Actions'),
        actions.all.map(action => { return Card({ action, store }) }),

        Button({
          label: '+',
          style: BUTTON,
          onClick: () => { actions.create({ title: "Test" }) }
        }),
      ]),

      Toast({
        message: store.result,
        visible: !!store.result,
        duration: 3000,
      }),
    ])
  }
})
