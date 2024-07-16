import { MessageBuilder } from '../shared/message'

const messageBuilder = new MessageBuilder()

function getActions() {
  console.log(settings.settingsStorage.getItem('cards'))
  return JSON.parse(settings.settingsStorage.getItem('cards') || '[{}]')
}

AppSideService({
  onInit() {
    messageBuilder.listen(() => { })

    messageBuilder.on('request', (ctx) => {
      const payload = messageBuilder.buf2Json(ctx.request.payload)

      return ctx.response({ data: { result: getActions() } })
    })
  },

  onRun() { },

  onDestroy() { },
});
