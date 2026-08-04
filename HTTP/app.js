import './shared/device-polyfill' // MUST be first: seeds setTimeout/Promise from the v1 timer global
import { APP_ID } from './pages/utils'
import { MessageBuilder } from './shared/message'

App({
  globalData: {
    messageBuilder: null,
  },

  onCreate() {
    const messageBuilder = new MessageBuilder({
      appId: APP_ID,
      appDevicePort: 20,
      appSidePort: 0,
    })
    this.globalData.messageBuilder = messageBuilder
    messageBuilder.connect()
  },

  onDestroy() {
    this.globalData.messageBuilder && this.globalData.messageBuilder.disConnect()
  },
})
