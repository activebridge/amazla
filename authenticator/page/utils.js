import * as fs from './../shared/fs.js'

// hmFS-backed storage — works on every runtime, unlike @zos/fs.
// `accounts.json` is owned by the phone sync; the app-widget's position lives in
// its own file so a sync can never clobber it.
const ACCOUNTS_FILE = 'accounts.json'
const WIDGET_INDEX_FILE = 'widget_index.txt'

export const localStorage = {
  get accounts() {
    try {
      return JSON.parse(fs.readFileSync(ACCOUNTS_FILE) || '[]')
    } catch (e) {
      return []
    }
  },

  set accounts(value) {
    try {
      fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(value))
    } catch (e) {
      console.log('accounts write error:', e)
    }
  },

  get widgetIndex() {
    try {
      const n = parseInt(fs.readFileSync(WIDGET_INDEX_FILE) || '0', 10)
      return isNaN(n) ? 0 : n
    } catch (e) {
      return 0
    }
  },

  set widgetIndex(value) {
    try {
      fs.writeFileSync(WIDGET_INDEX_FILE, String(value))
    } catch (e) {
      console.log('widgetIndex write error:', e)
    }
  },
}
