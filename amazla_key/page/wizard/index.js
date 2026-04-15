import * as hmUI from '@zos/ui'
import { BasePage } from '@zeppos/zml/base-page'
import { back } from '@zos/router'
import { keepScreenOn } from '../../../zeppify/index.js'
import store from '../../lib/store.js'
import Phone from '../../lib/phone.js'

import UI from '../../../pages/ui.js'
import { Instructions } from './steps/instructions.js'
import { Setup } from './steps/setup.js'
import { Success } from './steps/success.js'
import { Retry } from './steps/retry.js'
import { createPairingController } from './pairing.js'


var setupCtrl    = null   // returned by Setup(), holds cleanup()
var pairingCtrl  = null   // returned by createPairingController()
var wizardPage   = null   // BasePage `this` reference

function showInstructions() {
  cleanupSetup()
  UI.reset()
  Instructions({ onStart: startPairing })
}

function showSetup() {
  cleanupSetup()
  UI.reset()
  setupCtrl = Setup()
}

function showSuccess() {
  cleanupSetup()
  UI.reset()
  Success({ onHome: function() { back() } })
}

function showRetry(message) {
  cleanupSetup()
  UI.reset()
  Retry({
    message: message,
    onRetry: function() {
      showSetup()
      var phone = new Phone(wizardPage)
      pairingCtrl = createPairingController(
        phone, store,
        function(substate) { if (setupCtrl) setupCtrl.update(substate) },
        function() { showSuccess() },
        function(msg) { showRetry(msg) }
      )
      pairingCtrl.start()
    },
  })
}

function startPairing() {
  showSetup()
  var phone = new Phone(wizardPage)
  pairingCtrl = createPairingController(
    phone, store,
    function(substate) { if (setupCtrl) setupCtrl.update(substate) },
    function() { showSuccess() },
    function(msg) { showRetry(msg) }
  )
  pairingCtrl.start()
}

function cleanupSetup() {
  if (setupCtrl) {
    setupCtrl.cleanup()
    setupCtrl = null
  }
  if (pairingCtrl) {
    pairingCtrl.cancel()
    pairingCtrl = null
  }
}

Page(BasePage({
  build() {
    wizardPage = this
    hmUI.setStatusBarVisible(false)
    keepScreenOn(true)

    showInstructions()
  },

  onDestroy() {
    keepScreenOn(false)
    cleanupSetup()
    UI.reset()
  },
}))
