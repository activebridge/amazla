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
export const keepScreenOn = (enable = true, brightTime = 60000) => {
  if (enable) {
    pauseDropWristScreenOff({ duration: 0 })
    pausePalmScreenOff({ duration: 0 })
    setWakeUpRelaunch({ relaunch: true })
    setPageBrightTime({ brightTime })
  } else {
    resetDropWristScreenOff()
    resetPalmScreenOff()
    setWakeUpRelaunch({ relaunch: false })
  }
}
