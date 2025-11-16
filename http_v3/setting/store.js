import { Actions } from './models/action.js'
import { Config } from './models/config.js'

let resultTimeout

export const initStore = settingsStorage => {
  return {
    get actions() { return new Actions(settingsStorage) },
    get config() { return new Config(settingsStorage) },

    set result(value) {
      settingsStorage.setItem('result', value)
      clearTimeout(resultTimeout)
      resultTimeout = setTimeout(() => { settingsStorage.removeItem('result') }, 5000)
      return value
    },

    get result() {
      return settingsStorage.getItem('result')
    },

    set test(value) {
      settingsStorage.setItem('test', value)
      return value
    },

    get test() {
      return settingsStorage.getItem('test')
    },
  }
}
