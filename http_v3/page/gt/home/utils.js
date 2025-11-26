import { readFileSync, writeFileSync } from '@zos/fs'
import { showToast } from '@zos/interaction'

const DEFAULTS = {
  actions: [],
  config: {
    buttons: 4,
    awake: false,
  },
}

export const localStorage = {
  get settings() {
    try {
      const settings = readFileSync({
        path: '_settings.json',
        options: { encoding: 'utf8' },
      })
      return JSON.parse(settings)
    } catch {
      return DEFAULTS
    }
  },

  set settings(value) {
    try {
      writeFileSync({
        path: '_settings.json',
        data: JSON.stringify(value),
        options: { encoding: 'utf8' },
      })
    } catch (e) {
      showToast({ content: `ERROR: ${e}` })
    }
  },
}
