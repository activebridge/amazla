import { Accounts } from './models/account.js'

let statusTimeout
let timerStarted = false
let storage = null

export const initStore = (settingsStorage) => {
  storage = settingsStorage
}

export const store = {
  get accounts() {
    return new Accounts(storage)
  },

  set status(value) {
    storage.setItem('import_status', value)
    clearTimeout(statusTimeout)
    statusTimeout = setTimeout(() => {
      storage.removeItem('import_status')
    }, 3000)
  },

  get status() {
    return storage.getItem('import_status') || ''
  },

  startTimer() {
    if (!timerStarted && this.accounts.all.length > 0) {
      timerStarted = true
      setInterval(() => {
        storage.setItem('_tick', Date.now().toString())
      }, 1000)
    }
  },

  clearUrlInput() {
    storage.removeItem('url_input')
  },

  set showAddMenu(value) {
    storage.setItem('show_add_menu', value ? 'true' : '')
  },

  get showAddMenu() {
    return storage.getItem('show_add_menu') === 'true'
  },

  set showHelp(value) {
    storage.setItem('show_help', value ? 'true' : '')
  },

  get showHelp() {
    return storage.getItem('show_help') === 'true'
  },
}
