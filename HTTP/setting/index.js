import { Card } from './components/card.js'
import { Header } from './components/header.js'
import { initSearch } from './libs/search.js'
import { initSortable } from './libs/sortable.js'
import { initStore } from './store.js'
import { BODY, LIST, MAIN, PLACEHOLDER } from './styles.js'

AppSettingsPage({
  state: {},

  build({ settingsStorage }) {
    const store = initStore(settingsStorage)
    const { actions } = store

    // The settings runtime hands out the real document only through a React
    // event, so the first click anywhere boots the libs that need the DOM.
    // Clicks on the header and the rows bubble up to here, so any tap does it.
    const init = (e) => {
      initSortable(e, settingsStorage)
      initSearch(e)
    }

    return View({ style: BODY, onClick: init }, [
      Header(store, actions.all.length),

      View({ style: MAIN }, [
        View({ style: LIST }, [
          actions.all.map((action) => Card({ action })),
          actions.all.length === 0 && Text({ style: PLACEHOLDER }, 'No actions yet — tap + to add one'),
        ]),
      ]),
    ])
  },
})
