import { Header } from './components/header/index.js'
import { Body } from './components/body.js'
import { initStore, store } from './store.js'
import { initSortable } from './libs/sortable.js'
import { initSearch } from './libs/search.js'
import { initUrlInput } from './libs/urlInput.js'

const ROOT = {
  background: '#1D1E1F',
  height: '100vh',
  display: 'flex',
  flexDirection: 'column',
  maxWidth: '480px',
  margin: '0 auto',
  overflowX: 'hidden',
}

const preloadJsQR = (e) => {
  const win = e.nativeEvent.view.window
  const doc = win.document
  if (!win.jsQR && !win.jsQRScript) {
    const script = doc.createElement('script')
    script.id = 'jsQRScript'
    script.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js'
    doc.head.appendChild(script)
  }
}

const initAll = (e, settingsStorage) => {
  initSortable(e, settingsStorage)
  initSearch(e)
  initUrlInput(e)
  preloadJsQR(e)
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
