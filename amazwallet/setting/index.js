import { Header } from './components/header/index.js'
import { Body } from './components/body.js'
import { initStore } from './store.js'
import { initSearch } from './libs/search.js'
import { initSortable } from './libs/sortable.js'

const ROOT = {
  background: '#1D1E1F',
  height: '100vh',
  display: 'flex',
  flexDirection: 'column',
  maxWidth: '480px',
  margin: '0 auto',
  overflowX: 'hidden',
}

AppSettingsPage({
  build({ settingsStorage }) {
    initStore(settingsStorage)

    const init = (e) => {
      initSearch(e)
      initSortable(e, settingsStorage)
    }

    return View({ style: ROOT, onClick: init }, [
      Header(),
      Body(),
    ])
  },
})
