import { Actions } from './models/action.js'
import { Config } from './models/config.js'

let resultTimeout
let storage = null

// The injected DOM controls (libs/) live outside the settings render tree and
// have no props to receive a store through, so the store is a module singleton
// they can import. app-side/index.js keeps calling initStore for its own bundle.
export const store = {
  get actions() {
    return new Actions(storage)
  },
  get config() {
    return new Config(storage)
  },

  set result(value) {
    storage.setItem('result', value)
    clearTimeout(resultTimeout)
    resultTimeout = setTimeout(() => {
      storage.removeItem('result')
    }, 5000)
  },

  get result() {
    return storage.getItem('result')
  },

  set test(value) {
    storage.setItem('test', value)
  },

  get test() {
    return storage.getItem('test')
  },

  get help() {
    return storage.getItem('help') || 'true'
  },

  set help(value) {
    storage.setItem('help', value)
  },
}

export const initStore = (settingsStorage) => {
  storage = settingsStorage
  return store
}
