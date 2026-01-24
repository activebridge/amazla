import { getTimeRemaining } from './../page/libs/totp.js'
import vibrate from './../../pages/vibrate.js'

export const createTimer = (onTick, onRefresh) => {
  let interval = null

  const start = () => {
    if (interval) return
    interval = setInterval(() => {
      const remaining = getTimeRemaining()
      if (onTick) onTick(remaining)
      if (remaining === 30) {
        if (onRefresh) onRefresh()
        vibrate()
      }
    }, 1000)
  }

  const stop = () => {
    if (interval) {
      clearInterval(interval)
      interval = null
    }
  }

  return { start, stop }
}
