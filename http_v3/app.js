import { BaseApp } from '@zeppos/zml/base-app'
import { log as Logger } from '@zos/utils'

const logger = Logger.getLogger('http')

App(
  BaseApp({
    globalData: {},
    onCreate() {
      logger.log('app onCreate invoked')
    },

    onDestroy() {
      logger.log('app onDestroy invoked')
    }
  })
)
