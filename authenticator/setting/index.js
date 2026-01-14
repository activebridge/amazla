import { Header } from './components/header/index.js'
import { Body } from './components/body.js'
import { initStore, store } from './store.js'
import { initSortable } from './libs/sortable.js'
import { initSearch } from './libs/search.js'

const ROOT = {
  background: '#1D1E1F',
  height: '100vh',
  display: 'flex',
  flexDirection: 'column',
  maxWidth: '480px',
  margin: '0 auto',
  overflowX: 'hidden',
}

const initAll = (e, settingsStorage) => {
  initSortable(e, settingsStorage)
  initSearch(e)
}

AppSettingsPage({
  build({ settingsStorage }) {
    initStore(settingsStorage)
    store.startTimer()

    return View({ style: ROOT, onClick: (e) => initAll(e, settingsStorage) }, [
      Header(),
      Body(),
    ])
  },
})
