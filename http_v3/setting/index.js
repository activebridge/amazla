import { BODY, MAIN, CARD, BUTTON, RAW } from './styles.js'
import { Card } from './components/card.js'
import { Config } from './components/config.js'
import { H1 } from './components/h1.js'
import { loadFont } from './components/font.js'
import { initStore } from './store.js'

AppSettingsPage({
  state: {},

  build({ settingsStorage }) {
    const store = initStore(settingsStorage)
    const { actions, config } = store

    return View({ style: BODY }, [
      View({ style: MAIN, onClick: loadFont }, [

        H1('⚙️ Settings'),
        Config(config, actions.data),
        H1('🌎 Actions'),
        actions.all.map((action, index) => { return Card({ action, index, store }) }),

        Button({
          label: '+',
          style: BUTTON,
          onClick: () => { actions.create({ title: "Test", id: String(Date.now()) }) }
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
