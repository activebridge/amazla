import { exitApp } from './utils.js'

// Physical-key handling, v1-native (hmApp.registerKeyEvent) — @zos/interaction's
// onKey is not available in a v1-config build. Constants differ per device, so
// every one is looked up defensively: a missing key simply never matches.
//
// Callback contract: return true = we handled it, false = let the OS handle it
// (that is what still gives BACK its default "go back" behaviour when no shortcut
// action is configured).

const KEY = (name) => (typeof hmApp !== 'undefined' && hmApp.key ? hmApp.key[name] : undefined)
const ACTION = (name) => (typeof hmApp !== 'undefined' && hmApp.action ? hmApp.action[name] : undefined)

const is = (value, name) => {
  const constant = KEY(name)
  return constant !== undefined && value === constant
}

export const keyListener = (focus, exec) => {
  if (typeof hmApp === 'undefined' || !hmApp.registerKeyEvent) return

  // render() runs again after the phone answers, so drop the previous handler
  // instead of stacking a second one on top of it.
  keyUnlisten()

  hmApp.registerKeyEvent((key, event) => {
  const longPress = ACTION('LONG_PRESS')
  const isLong = longPress !== undefined && event === longPress

  // One physical press is delivered as several events (press, release, click).
  // Acting on all of them ran every action twice, so only the click counts —
  // the same gate the v3 build used. Devices without the constant keep the old
  // "anything that is not a long press" behaviour rather than going dead.
  const click = ACTION('CLICK')
  if (click !== undefined && event !== click && !isLong) return false

  if (is(key, 'BACK') || is(key, 'SHORTCUT')) {
    // Long press leaves the app; a plain press runs the configured shortcut
    // action, or falls through to the OS when there is none.
    if (isLong) {
      exitApp()
      return true
    }
    return exec(true)
  }

  if (isLong) return false

  if (is(key, 'UP')) {
    focus(1)
    return true
  }
  if (is(key, 'DOWN')) {
    focus(-1)
    return true
  }
  if (is(key, 'SELECT') || is(key, 'HOME')) {
    return exec()
  }

    return false
  })
}

export const keyUnlisten = () => {
  if (typeof hmApp !== 'undefined' && hmApp.unregisterKeyEvent) hmApp.unregisterKeyEvent()
}
