import '../zeppify/zos-globals' // MUST be first: seeds hmUI/hmSetting globals that ui.js needs
import './shared/device-polyfill'
import { getPackageInfo } from '@zos/app'
import * as ble from '@zos/ble'
import { MessageBuilder } from './shared/message'

App({
  globalData: {
    messageBuilder: null,
  },
  onCreate() {
    const { appId } = getPackageInfo()
    const messageBuilder = new MessageBuilder({
      appId,
      appDevicePort: 20,
      appSidePort: 0,
      ble,
    })
    this.globalData.messageBuilder = messageBuilder
    messageBuilder.connect()
  },

  onDestroy() {
    this.globalData.messageBuilder && this.globalData.messageBuilder.disConnect()
  },
})
