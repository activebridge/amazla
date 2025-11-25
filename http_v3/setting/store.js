import { Actions } from './models/action.js'
import { Config } from './models/config.js'

let resultTimeout

export const initStore = (settingsStorage) => {
  return {
    get actions() {
      return new Actions(settingsStorage)
    },
    get config() {
      return new Config(settingsStorage)
    },

    set result(value) {
      settingsStorage.setItem('result', value)
      clearTimeout(resultTimeout)
      resultTimeout = setTimeout(() => {
        settingsStorage.removeItem('result')
      }, 5000)
    },

    get result() {
      return settingsStorage.getItem('result')
    },

    set test(value) {
      settingsStorage.setItem('test', value)
    },

    get test() {
      return settingsStorage.getItem('test')
    },

    get help() {
      return settingsStorage.getItem('help')
    },

    set help(value) {
      settingsStorage.setItem('help', value)
    },
  }
}
