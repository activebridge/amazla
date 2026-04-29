import './shared/device-polyfill'
import { MessageBuilder } from './shared/message'
import { getPackageInfo } from '@zos/app'
import * as ble from '@zos/ble'
import { kpayConfig } from './shared/kpay-config'
import kpayApp from 'kpay-amazfit/app'

App({
  globalData: {
    messageBuilder: null,
    kpay: null,
  },
  onCreate() {
    const { appId } = getPackageInfo()
    const messageBuilder = new MessageBuilder({ appId, appDevicePort: 20, appSidePort: 0, ble })
    this.globalData.messageBuilder = messageBuilder
    messageBuilder.connect()

    const kpay = new kpayApp({ ...kpayConfig, dialogPath: 'page/kpay/index.page', messageBuilder })
    this.globalData.kpay = kpay
    kpay.init()
  },
  onDestroy() {
    this.globalData.messageBuilder && this.globalData.messageBuilder.disConnect()
  },
})
