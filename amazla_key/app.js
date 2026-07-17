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

    // Re-shake on side-service Close. The Zepp app spawns the side service ONLY in
    // response to a shake (launchType: peerAppLaunched); once the phone kills the
    // service (idle kill, app update), data frames on the stale port are answered
    // with a type-2 Close forever and every RPC hangs. Re-shaking respawns it.
    // Device-confirmed 2026-07-14: service ran, install event destroyed it, all
    // later requests got closes until the app restarted (= the next shake).
    let lastReshake = 0
    messageBuilder.on('raw', (frame) => {
      try {
        const b = new Uint8Array(frame)
        const type = b[2] | (b[3] << 8)
        if (type !== 2) return // MessageType.Close
        const now = Date.now()
        if (now - lastReshake < 2000) return // debounce close bursts
        lastReshake = now
        console.log('[APP] side service closed — re-shaking to respawn it')
        messageBuilder.appSidePort = 0 // sendShake() only fires while port is 0
        messageBuilder.sendShake()
      } catch (_e) {}
    })

    // KPAY is constructed BEFORE connect(): connect()'s shake throws when the phone
    // link is down at launch (ble.send returns false → sendBin throws), and an aborted
    // onCreate stranded globalData.kpay null for the whole session — paying users saw
    // 'Unlicensed' + a dead Purchase button (device 2026-07-14 and 2026-07-17).
    // Licensing must never depend on the phone link. kpay.init() is safe pre-shake:
    // its RPCs queue on waitingShakePromise (created in the MessageBuilder constructor).
    const kpay = new kpayApp({ ...kpayConfig, dialogPath: 'page/kpay/index.page', messageBuilder })
    this.globalData.kpay = kpay
    kpay.init()

    try {
      messageBuilder.connect()
    } catch (e) {
      // Phone unreachable at launch. The key works standalone; messaging recovers
      // via the raw-Close re-shake above or the next app launch.
      console.log('[APP] launch shake failed:', e)
    }
  },
  onDestroy() {
    this.globalData.messageBuilder && this.globalData.messageBuilder.disConnect()
  },
})
