import { MessageBuilder } from '../shared/message'

const messageBuilder = new MessageBuilder()

function getActions() {
  return JSON.parse(settings.settingsStorage.getItem('actions') || '[{}]')
}

function parse(str) {
  let result = {}
  try {
    let rows = str.match(/(.*)=(.*)/g)
    rows.map(r => {
      const pair = r.split('=')
      result[pair[0]] = pair[1]
    })
    return result
  } catch(error) {
    return { Error: error }
  }
}

async function fetchData(ctx, i) {
  try {
    const action = getActions()[Number(i)]
    const res = await fetch({
      url: action.url,
      method: action.method,
      headers: parse(action.headers),
      body: JSON.stringify(parse(action.body)),
    })

    const body = typeof res.body === 'string' ? res.body : JSON.stringify(res.body)
    ctx.response({ data: { result: body, status: res.status } })
  } catch (error) {
    ctx.response({ data: { result: JSON.stringify(error) } })
  }
};

AppSideService({
  onInit() {
    messageBuilder.listen(() => { })

    messageBuilder.on('request', (ctx) => {
      const payload = messageBuilder.buf2Json(ctx.request.payload)

      if (payload.method === 'GET_ACTIONS') return ctx.response({ data: { result: getActions() } })

      return fetchData(ctx, payload.method)
    })
  },

  onRun() { },

  onDestroy() { },
});
