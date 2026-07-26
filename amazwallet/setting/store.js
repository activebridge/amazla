import { Cards } from './models/card.js'

let statusTimeout
let storage = null

export const initStore = (settingsStorage) => {
  storage = settingsStorage
}

export const store = {
  get cards() {
    return new Cards(storage)
  },

  set status(value) {
    clearTimeout(statusTimeout)
    storage.setItem('status', value)
    statusTimeout = setTimeout(() => {
      storage.removeItem('status')
    }, 4000)
  },

  get status() {
    return storage.getItem('status') || ''
  },

  set showHelp(value) {
    storage.setItem('show_help', value ? 'true' : '')
  },

  get showHelp() {
    return storage.getItem('show_help') === 'true'
  },

  // Which card the add/edit dialog targets: 'new' | '<index>' | '' (closed).
  set editIndex(value) {
    storage.setItem('edit_index', value == null ? '' : String(value))
  },

  get editIndex() {
    const v = storage.getItem('edit_index')
    return v == null ? '' : v
  },
}
