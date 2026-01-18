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
      const methods = {
        SYNC_ACCOUNTS: () => {
          const accounts = getAccounts()
          res(null, { accounts })
        },
      }

      methods[req.method]?.()
    },

    onSettingsChange() {},

    onRun() {},
    onDestroy() {},
  })
)
