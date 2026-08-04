import { initStore } from '../setting/store.js'
import { MessageBuilder } from '../shared/message'
import { xhr } from './xhr.js'

// shared/message.js serves both sides — it selects the phone transport when hmBle
// isn't defined — so there is no separate message-side build here.
const messageBuilder = new MessageBuilder()
const store = initStore(settings.settingsStorage)

const testRequest = async (id) => {
  const action = store.actions.data.find((a) => a.id === String(id))
  const { body, status, success } = await xhr(action)

  const label = success ? '✅' : '❌'
  store.result = `${label} | ${status} ➜ ${JSON.stringify(body)}`
}

AppSideService({
  onInit() {
    messageBuilder.listen(() => {})

    messageBuilder.on('request', async (ctx) => {
      const { method, params } = messageBuilder.buf2Json(ctx.request.payload)

      if (method === 'SETTINGS') {
        ctx.response({
          data: { result: { actions: store.actions.data, config: store.config.data } },
        })
        return
      }

      if (method === 'FETCH') {
        const result = await xhr(store.actions.data.find((a) => a.id === params.id))
        ctx.response({ data: { result } })
      }
    })

    // Plain AppSideService has no onSettingsChange lifecycle (zml's BaseSideService
    // wired settingsStorage 'change' for us). Register the listener directly.
    settings.settingsStorage.addListener('change', ({ key, newValue }) => {
      if (key === 'test') testRequest(newValue)
    })
  },

  onRun() {},
  onDestroy() {},
})
