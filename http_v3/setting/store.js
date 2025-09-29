export const initStore = settingStorage => {
  return {
    get actions() {
      return JSON.parse(settingStorage.getItem('actions') || '[{}]')
    },

    get settings() {
      return JSON.parse(settingStorage.getItem('settings') || '{}')
    },

    set settings(value) {
      this.settings
      settingStorage.setItem('settings', JSON.stringify(value))
      return value
    },

    set output(value) {
      const settings = this.settings
      settings.output = value
      this.settings = settings
    },

    set result(value) {
      settingStorage.setItem('result', value)
    },

    get result() {
      return settingStorage.getItem('result')
    }
  }
}
