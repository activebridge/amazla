import './../shared/device-polyfill' // MUST be first: seeds setTimeout/Promise from the v1 timer global
import { text } from './../../pages/ui.js'
import { response } from './../pages/output.js'
import { PER_SLIDE, Slide } from './../pages/slide.js'
import { APP_ID, localStorage, toast } from './../pages/utils.js'
import { MessageBuilder } from './../shared/message'

let isBusy = false
let mb = null

// The secondary-widget may run in a context where app.onCreate hasn't seeded
// globalData.messageBuilder — reuse it if present, otherwise create our own.
const getMessageBuilder = () => {
  const app = getApp()
  if (app && app._options && app._options.globalData && app._options.globalData.messageBuilder) {
    return app._options.globalData.messageBuilder
  }
  if (!mb) {
    mb = new MessageBuilder({ appId: APP_ID, appDevicePort: 20, appSidePort: 0 })
    mb.connect()
  }
  return mb
}

SecondaryWidget({
  state: { settings: localStorage.settings },

  onInit() {
    this.state.settings = localStorage.settings
  },

  fetch(id) {
    if (isBusy) return toast('Busy...')
    isBusy = true
    const action = this.state.settings.actions.find((a) => a.id === String(id))
    toast('Running ' + (action ? action.title : id))
    getMessageBuilder()
      .request({ method: 'FETCH', params: { id } })
      .then(({ result }) => {
        // `true` = widget context: the Alert dialog is suppressed (it would cover
        // the watchface carousel), the Result Screen still opens.
        response(result, this.state.settings, true)
      })
      .catch((error) => {
        toast('ERROR: ' + error)
      })
      .finally(() => {
        isBusy = false
      })
  },

  build() {
    const {
      settings: {
        actions = [],
        config: { buttons = 4 } = {},
      },
    } = this.state

    if (actions.length === 0) {
      text({
        text: 'No actions configured.\nPlease set up actions in the settings',
      })
      return
    }
    Slide(this, actions.slice(0, Math.min(buttons, PER_SLIDE)), 0, 0)
  },
})
