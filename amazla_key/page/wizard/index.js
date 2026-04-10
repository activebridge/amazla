import * as hmUI from '@zos/ui'
import { BasePage } from '@zeppos/zml/base-page'
import { back } from '@zos/router'
import { writeFileSync, readFileSync } from '@zos/fs'
import { keepScreenOn } from '../../../zeppify/index.js'

import UI from '../../../pages/ui.js'
import { Instructions } from './steps/instructions.js'
import { Setup } from './steps/setup.js'
import { Success } from './steps/success.js'
import { Retry } from './steps/retry.js'
import { createPairingController } from './pairing.js'

var storage = {
  data: {},
  load: function() {
    try {
      var json = readFileSync({ path: 'ble_settings.txt', options: { encoding: 'utf8' } })
      this.data = json ? JSON.parse(json) : {}
    } catch (e) { this.data = {} }
  },
  save: function() {
    writeFileSync({ path: 'ble_settings.txt', data: JSON.stringify(this.data), options: { encoding: 'utf8' } })
  },
  getItem: function(key) { return this.data[key] || null },
  setItem: function(key, val) { this.data[key] = val; this.save() },
  removeItem: function(key) { delete this.data[key]; this.save() },
}

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
      pairingCtrl = createPairingController(
        wizardPage, storage,
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
  pairingCtrl = createPairingController(
    wizardPage, storage,
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
    storage.load()
    showInstructions()
  },

  onDestroy() {
    keepScreenOn(false)
    cleanupSetup()
    UI.reset()
  },
}))
