import { BaseSideService, settingsLib } from '@zeppos/zml/base-side'

const getAccounts = () => {
  try {
    const data = settingsLib.getItem('accounts')
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

AppSideService(
  BaseSideService({
    onInit() {},

    onRequest(req, res) {
      console.log('AppSideService onRequest:', req.method)

      const methods = {
        SYNC_ACCOUNTS: () => {
          const accounts = getAccounts()
          res(null, { accounts })
        },
      }

      methods[req.method]?.()
    },

    onSettingsChange({ key, newValue }) {
      console.log('Settings changed:', key)
    },

    onRun() {},
    onDestroy() {},
  })
)
