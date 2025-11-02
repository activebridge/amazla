import { BaseSideService } from '@zeppos/zml/base-side'
import { settingsLib } from '@zeppos/zml/base-side'

const store = {
  get actions() {
    return JSON.parse(settingsLib.getItem('actions') || '[]')
  },
  get config() {
    return JSON.parse(settingsLib.getItem('config') || '{}')
  },
}

const parse = str => {
  try {
    const matches = [...str.matchAll(/^(?<key>.*)=(?<value>.*)$/gm)]
    const pairs = matches.reduce((object, { groups: { key, value } }) => {
      object[key] = value
      return object
    }, {})
    return pairs
  } catch(error) {
    return { Error: error }
  }
}

const extract = (response, key) => {
  if (!key) return response
  return key.split('.').reduce((value, key) => { return value?.[key] }, response)
}

async function fetchData(res, i) {
  try {
    const action = store.actions[i]
    console.log(i)
    const response = await fetch({
      url: action.url,
      method: action.method,
      headers: parse(action.headers),
      body: ['GET', undefined].includes(action.method) ? undefined : JSON.stringify(parse(action.body)),
    })

    const key = response.ok ? action.successKey : action.errorKey
    const body = action.json ? extract(await response.json(), key) : await response.text()

    res(null, { result: { body, status: response.status } })
  } catch (error) {
    res(null, { result: { body: 'Invalid request details', status: 0 } })
  }
}

AppSideService(
  BaseSideService({
    onInit() {},
    onRequest(req, res) {
      console.log('AppSideService onRequest invoked', req)
      const methods ={
        SETTINGS: () => {
          res(null, { result: { actions: store.actions, config: store.config } })
        },
        FETCH: () => {
          fetchData(res, req.params.index)
        },
      }
      methods[req.method]?.()
    },
    // onSettingsChange({ key, newValue, oldValue }) {
    //   this.call({
    //     result: getActions()
    //   })
    // },
    onRun() {},
    onDestroy() {}
  })
)
