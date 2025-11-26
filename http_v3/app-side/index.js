import { BaseSideService, settingsLib } from '@zeppos/zml/base-side'
import { initStore } from '../setting/store.js'
import { xhr } from './xhr.js'

const store = initStore(settingsLib)

const testRequest = async (id) => {
  const action = store.actions.data.find((a) => a.id === String(id))
  const { body, status, success } = await xhr(action)

  const label = success ? '✅' : '❌'
  store.result = `${label} | ${status} ➜ ${JSON.stringify(body)}`
}

AppSideService(
  BaseSideService({
    onInit() {},
    onRequest(req, res) {
      console.log('AppSideService onRequest invoked', req)
      const methods = {
        SETTINGS: () => {
          res(null, { result: { actions: store.actions.data, config: store.config.data } })
        },
        FETCH: async () => {
          res(null, { result: await xhr(store.actions.data.find((a) => a.id === req.params.id)) })
        },
      }
      methods[req.method]?.()
    },
    onSettingsChange({ key, newValue, _oldValue }) {
      if (key !== 'test') return
      testRequest(newValue)
    },
    onRun() {},
    onDestroy() {},
  }),
)
