/**
 * Zeppify Screen Module
 * Controls screen timeout and wake behavior
 */

import {
  pauseDropWristScreenOff,
  pausePalmScreenOff,
  setWakeUpRelaunch,
  resetDropWristScreenOff,
  resetPalmScreenOff,
  setPageBrightTime,
} from '@zos/display'

/**
 * Keep screen on or restore default behavior
 * @param {boolean} enable - true to keep screen on, false to restore defaults
 * @param {number} brightTime - screen bright time in ms (default 60000 = 1 min)
 */
// Not every @zos/display API exists on every device/API level (e.g. GTR Mini at
// apiVersion 2.0 is missing some), so call each one only if it's a function.
const call = (fn, arg) => {
  if (typeof fn === 'function') fn(arg)
}

export const keepScreenOn = (enable = true, brightTime = 60000) => {
  if (enable) {
    call(pauseDropWristScreenOff, { duration: 0 })
    call(pausePalmScreenOff, { duration: 0 })
    call(setWakeUpRelaunch, { relaunch: true })
    call(setPageBrightTime, { brightTime })
  } else {
    call(resetDropWristScreenOff)
    call(resetPalmScreenOff)
    call(setWakeUpRelaunch, { relaunch: false })
  }
}
