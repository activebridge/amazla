
import { pauseDropWristScreenOff, pausePalmScreenOff, setWakeUpRelaunch, resetDropWristScreeOff, resetPalmScreenOff } from '@zos/display'

export const keepScreenOn = (enable = true) => {
  if (enable) {
    pauseDropWristScreenOff(0)
    pausePalmScreenOff(0)
    setWakeUpRelaunch(true)
  } else {
    resetDropWristScreeOff()
    resetPalmScreenOff()
    setWakeUpRelaunch(false)
  }
}
