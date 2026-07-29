import { getTimeRemaining } from './../page/libs/totp.js'
import vibro from './../../zeppify/vibrate.js'

export const createTimer = (onTick, onRefresh) => {
  let interval = null
  let last = 0

  const start = () => {
    if (interval) return
    // Seed from the clock so a tick right after start() can't read as a roll-over.
    last = getTimeRemaining()
    interval = setInterval(() => {
      const remaining = getTimeRemaining()
      if (onTick) onTick(remaining)
      // Refresh on the period's ROLL-OVER, i.e. the tick where the countdown jumps
      // back up. Testing `remaining === 30` instead fires on every tick that lands
      // in that one wall-clock second — and setInterval drifts, so several do,
      // which is why a single refresh buzzed three or four times.
      if (remaining > last) {
        if (onRefresh) onRefresh()
        vibro.long()
      }
      last = remaining
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
