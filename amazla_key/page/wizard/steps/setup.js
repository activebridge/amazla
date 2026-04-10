import * as hmUI from '@zos/ui'
import { text, rect, width, height } from '../../../../pages/ui.js'

var STATES = {
  connecting: { label: 'Connecting...',   hint: 'Looking for your Tesla' },
  pairing:    { label: 'Pairing...',      hint: 'Sending pairing request' },
  confirming: { label: 'Tap NFC card',    hint: 'Hold card on steering column' },
  verifying:  { label: 'Confirming...',   hint: 'Verifying key enrollment' },
}

// Setup renders Step 2: animated status indicator with dynamic state messages.
// Returns { update(substate), cleanup() }.
export const Setup = () => {
  var dotWidget   = null
  var labelWidget = null
  var hintWidget  = null
  var pulseTimer  = null
  var pulseOn     = true

  // Pulsing dot — vertically centered, slightly above center
  dotWidget = rect({
    centered: false,
    x: ((width - 18) / 2) | 0,
    y: (height * 0.35) | 0,
    w: 18,
    h: 18,
    radius: 9,
    color: 0xffffff,
  })

  // Status label
  labelWidget = text({
    centered: false,
    x: 0,
    y: (height * 0.45) | 0,
    w: width,
    h: 44,
    text: STATES.connecting.label,
    text_size: 24,
    color: 0xffffff,
    align_h: hmUI.align.CENTER_H,
    align_v: hmUI.align.CENTER_V,
  })

  // Hint text
  hintWidget = text({
    centered: false,
    x: 0,
    y: (height * 0.57) | 0,
    w: width,
    h: 28,
    text: STATES.connecting.hint,
    text_size: 16,
    color: 0x888888,
    align_h: hmUI.align.CENTER_H,
    align_v: hmUI.align.CENTER_V,
  })

  // Start pulsing animation (white ↔ gray every 600ms)
  pulseTimer = setInterval(function() {
    pulseOn = !pulseOn
    if (dotWidget) dotWidget.setProperty(hmUI.prop.COLOR, pulseOn ? 0xffffff : 0x444444)
  }, 600)

  const update = function(substate) {
    var s = STATES[substate] || STATES.connecting
    if (labelWidget) labelWidget.setProperty(hmUI.prop.TEXT, s.label)
    if (hintWidget)  hintWidget.setProperty(hmUI.prop.TEXT, s.hint)
    // Orange dot while waiting for NFC tap
    if (substate === 'confirming' && dotWidget) {
      dotWidget.setProperty(hmUI.prop.COLOR, 0xff8800)
    }
  }

  const cleanup = function() {
    if (pulseTimer) {
      clearInterval(pulseTimer)
      pulseTimer = null
    }
    dotWidget   = null
    labelWidget = null
    hintWidget  = null
  }

  return { update, cleanup }
}
