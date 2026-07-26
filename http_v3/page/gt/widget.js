import './../../shared/device-polyfill'
import { getPackageInfo } from '@zos/app'
import * as ble from '@zos/ble'
import { showToast } from '@zos/interaction'
import { text } from './../../../pages/ui.js'
import { MessageBuilder } from './../../shared/message'
import { response } from './home/response.js'
import { Slide } from './home/slide.js'
import { localStorage } from './home/utils.js'

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
    const { appId } = getPackageInfo()
    mb = new MessageBuilder({ appId, appDevicePort: 20, appSidePort: 0, ble })
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
    if (isBusy) return showToast({ content: 'Busy...' })
    isBusy = true
    const action = this.state.settings.actions.find((a) => a.id === String(id))
    showToast({ content: `Running ${action.title}` })
    getMessageBuilder()
      .request({ method: 'FETCH', params: { id } })
      .then(({ result }) => {
        response(result, this.state.settings, true)
      })
      .catch((error) => {
        showToast({ content: `ERROR: ${error}` })
      })
      .finally(() => {
        isBusy = false
      })
  },

  build() {
    const {
      settings: {
        actions,
        config: { buttons },
      },
    } = this.state
    const firstFourActions = actions.slice(0, buttons)

    if (actions.length === 0) {
      text({
        text: 'No actions configured.\nPlease set up actions in the settings',
      })
      return
    }
    Slide(this, firstFourActions, 0, 0)
  },
})
