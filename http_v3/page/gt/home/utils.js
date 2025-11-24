import { showToast } from '@zos/interaction'
import { writeFileSync, readFileSync } from '@zos/fs'

export const localStorage = {
  get settings() {
    try {
      const settings = readFileSync({ path: 'settings.json', options: { encoding: 'utf8' } })
      return JSON.parse(settings || '{}')
    } catch (e) {
      showToast({ content: `ERROR: ${e}` })
      return {}
    }
  },

  set settings(value) {
    try {
      writeFileSync({ path: 'settings.json', data: JSON.stringify(value), options: { encoding: 'utf8' } })
    } catch (e) {
      showToast({ content: `ERROR: ${e}` })
    }
  },
}
