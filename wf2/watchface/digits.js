import { Time } from '@zos/sensor'
import * as hmUI from '@zos/ui'
import { getTimeFormat, TIME_FORMAT_24 } from '@zos/settings'
import { width, height, size } from '../../pages/ui.js'
import { s, pos } from './utils.js'

var lastH = -1, lastM = -1
var hDig0, hDig1, mDig0, mDig1

export function placeDigits() {
  hDig0 = hmUI.createWidget(hmUI.widget.IMG, { src: 'time/0.png', show_level: hmUI.show_level.ONLY_NORMAL })
  hDig1 = hmUI.createWidget(hmUI.widget.IMG, { src: 'time/0.png', show_level: hmUI.show_level.ONLY_NORMAL })
  mDig0 = hmUI.createWidget(hmUI.widget.IMG, { src: 'time-min/0.png', show_level: hmUI.show_level.ONLY_NORMAL })
  mDig1 = hmUI.createWidget(hmUI.widget.IMG, { src: 'time-min/0.png', show_level: hmUI.show_level.ONLY_NORMAL })

  // AOD
  hmUI.createWidget(hmUI.widget.IMG_TIME, {
    hour_zero: 0,
    hour_startX: Math.floor(width / 2) - Math.round(50 * s),
    hour_startY: Math.floor(height / 2) - Math.round(35 * s),
    hour_array: Array.from({ length: 10 }, function(_, i) { return 'time/' + i + '.png' }),
    hour_space: Math.round(-10 * s),
    hour_unit_en: '',
    hour_unit_sc: '',
    minute_follow: 0,
    minute_zero: 1,
    minute_startX: Math.floor(width / 2) - Math.round(50 * s),
    minute_startY: Math.floor(height / 2) + Math.round(4 * s),
    minute_array: Array.from({ length: 10 }, function(_, i) { return 'time-min/' + i + '.png' }),
    minute_space: Math.round(-15 * s),
    show_level: hmUI.show_level.ONLY_AOD,
  })
}

export function placeTime() {
  var t = new Time()
  var h = t.getHours()
  var m = t.getMinutes()
  if (h === lastH && m === lastM) return
  lastH = h
  lastM = m

  var is24 = getTimeFormat() === TIME_FORMAT_24
  var displayHour = is24 ? h : (h % 12 || 12)
  var hAngle = ((h % 12) * 30 - 90) * Math.PI / 180
  var hR = Math.round(155 * s)
  var hOx = Math.round(hR * Math.cos(hAngle))
  var hOy = Math.round(hR * Math.sin(hAngle))
  var hDigitH = Math.round(62 * s)
  var hTens = Math.floor(displayHour / 10)
  var hOnes = displayHour % 10
  var hW = [60,40,52,52,52,52,56,46,55,56]
  var gap = Math.round(-10 * s)

  if (hTens > 0) {
    var w0 = Math.round(hW[hTens] * s)
    var w1 = Math.round(hW[hOnes] * s)
    var total = w0 + gap + w1
    var p0 = pos(hOx - Math.floor(total / 2) + Math.floor(w0 / 2), hOy, w0, hDigitH)
    var p1 = pos(hOx - Math.floor(total / 2) + w0 + gap + Math.floor(w1 / 2), hOy, w1, hDigitH)
    hDig0.setProperty(hmUI.prop.MORE, { x: p0.x, y: p0.y, src: 'time/' + hTens + '.png' })
    hDig1.setProperty(hmUI.prop.MORE, { x: p1.x, y: p1.y, src: 'time/' + hOnes + '.png' })
  } else {
    var w = Math.round(hW[hOnes] * s)
    var p = pos(hOx, hOy, w, hDigitH)
    hDig0.setProperty(hmUI.prop.MORE, { x: p.x, y: p.y, src: 'time/' + hOnes + '.png' })
    hDig1.setProperty(hmUI.prop.MORE, { x: -500, y: -500 })
  }

  var mAngle = (m * 6 - 90) * Math.PI / 180
  var mR = Math.floor(size / 2) - Math.round(38 * s)
  var mOx = Math.round(mR * Math.cos(mAngle))
  var mOy = Math.round(mR * Math.sin(mAngle))
  var mDigitW = Math.round(46 * s)
  var mDigitH = Math.round(52 * s)
  var mGap = Math.round(-15 * s)
  var mTotal = mDigitW * 2 + mGap

  var mp0 = pos(mOx - Math.floor(mTotal / 2) + Math.floor(mDigitW / 2), mOy, mDigitW, mDigitH)
  var mp1 = pos(mOx - Math.floor(mTotal / 2) + mDigitW + mGap + Math.floor(mDigitW / 2), mOy, mDigitW, mDigitH)
  mDig0.setProperty(hmUI.prop.MORE, { x: mp0.x, y: mp0.y, src: 'time-min/' + Math.floor(m / 10) + '.png' })
  mDig1.setProperty(hmUI.prop.MORE, { x: mp1.x, y: mp1.y, src: 'time-min/' + (m % 10) + '.png' })
}
