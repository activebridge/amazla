import { Card } from './components/card.js'
import { Config } from './components/config.js'
import { H1 } from './components/h1.js'
import { Help } from './components/help.js'
import { initStore } from './store.js'
import { BODY, BUTTON, MAIN } from './styles.js'

AppSettingsPage({
  state: {},

  build({ settingsStorage }) {
    const store = initStore(settingsStorage)
    const { actions, config } = store

    return View({ style: BODY }, [
      View({ style: MAIN }, [
        Help(store),
        H1('⚙️ Settings'),
        Config(config, actions.data),
        H1('🌎 Actions'),
        actions.all.map((action, index) => {
          return Card({ action, index, store })
        }),

        Button({
          label: '+',
          style: BUTTON,
          onClick: () => {
            actions.create({
              title: `Action ${(actions.data.length || 0) + 1}`,
              id: String(Date.now()),
            })
          },
        }),
      ]),

      Toast({
        message: store.result,
        visible: !!store.result,
        duration: 3000,
      }),
    ])
  },
})
