import { readFileSync, writeFileSync } from '@zos/fs'

const DEFAULTS = {
  accounts: [],
}

export const localStorage = {
  get accounts() {
    try {
      const data = readFileSync({
        path: 'accounts.json',
        options: { encoding: 'utf8' },
      })
      return JSON.parse(data)
    } catch {
      return DEFAULTS.accounts
    }
  },

  set accounts(value) {
    try {
      writeFileSync({
        path: 'accounts.json',
        data: JSON.stringify(value),
        options: { encoding: 'utf8' },
      })
    } catch (e) {
      console.log('localStorage write error:', e)
    }
  },
}
