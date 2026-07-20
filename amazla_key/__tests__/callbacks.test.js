/**
 * Unit tests for the page-level auto-unlock callback (page/callbacks.js).
 *
 * It owns the settings-toggle policy (store.autoUnlock); tesla is
 * spied so no BLE hardware is touched. Logic moved here from lib/tesla.js (lockOnClose)
 * on 2026-07-14 so tesla stays a pure key/transport facade.
 */

import { jest } from '@jest/globals'
import { autoExitOnLock, autoUnlock, clearSelfLock, noteSelfLock } from '../page/callbacks.js'
import tesla from '../lib/tesla.js'
import store from '../lib/store.js'
import { _fsStore } from '../__mocks__/zos.js'

beforeEach(() => {
  jest.clearAllMocks()
  Object.keys(_fsStore).forEach((k) => delete _fsStore[k])
  store.reset()
  // store.reset() keeps the auto-unlock pref (survives a vehicle unpair), so clear
  // it explicitly here or a prior test's value leaks into the next.
  store.autoUnlock = false
  tesla.connection = { status: 'online', error: null }
  tesla.locked = false
  tesla.userPresent = false
})

// App-close auto-lock was removed 2026-07-16 (no reliable VCSEC occupant signal —
// userPresence is key-detection, so it locked while seated). Tesla's own walk-away
// lock handles it. Only autoUnlock remains.

// ─── autoUnlock (connect pre-load step) ────────────────────────────────────────
// autoUnlock(done) is registered via tesla.beforeInitialLoad (page/main.js): the
// status read and passive entry wait on done(), so it must ALWAYS be called —
// whether the unlock fires, is skipped, or fails.

describe('autoUnlock()', () => {
  test('autoUnlock on + car locked → sends unlock, done() after the unlock settles', () => {
    store.autoUnlock = true
    tesla.locked = true
    let unlockCb = null
    const spy = jest.spyOn(tesla, 'unlock').mockImplementation((cb) => {
      unlockCb = cb
    })
    const done = jest.fn()
    autoUnlock(done)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(done).not.toHaveBeenCalled() // load waits for the unlock to settle
    unlockCb({ success: true })
    expect(done).toHaveBeenCalledTimes(1)
  })

  test('unlock FAILURE still calls done() — the status load must not hang', () => {
    store.autoUnlock = true
    tesla.locked = true
    jest.spyOn(tesla, 'unlock').mockImplementation((cb) => cb({ success: false, error: 'timeout' }))
    const done = jest.fn()
    autoUnlock(done)
    expect(done).toHaveBeenCalledTimes(1)
  })

  test('autoUnlock off (default) → no unlock, done() immediately', () => {
    tesla.locked = true
    const spy = jest.spyOn(tesla, 'unlock').mockImplementation(() => {})
    const done = jest.fn()
    autoUnlock(done)
    expect(spy).not.toHaveBeenCalled()
    expect(done).toHaveBeenCalledTimes(1)
  })

  test('fires even when the state says unlocked — "no matter state" (stale cache must not block it)', () => {
    store.autoUnlock = true
    tesla.locked = false
    const spy = jest.spyOn(tesla, 'unlock').mockImplementation((cb) => cb({ success: true }))
    const done = jest.fn()
    autoUnlock(done)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(done).toHaveBeenCalledTimes(1)
  })
})

// ─── autoExitOnLock (walk-away exit) ───────────────────────────────────────────
// Called on every tesla.onChange notify. Exit fires ONLY when the settings toggle
// (store.exitOnLock, default OFF) is on AND the car locks ITSELF after we saw it
// unlocked this connection — a manual lock tap (noteSelfLock) and an app opened on
// an already-locked car must not exit.

describe('autoExitOnLock()', () => {
  const noop = () => {}

  beforeEach(() => {
    // Reset the module-scope tracking: an offline notify clears both flags.
    tesla.connection = { status: 'offline', error: null }
    autoExitOnLock(noop)
    tesla.connection = { status: 'online', error: null }
    store.exitOnLock = true
  })

  test('toggle off (default) → walk-away lock never exits', () => {
    store.exitOnLock = false
    const exitFn = jest.fn()
    tesla.locked = false
    autoExitOnLock(exitFn) // saw unlocked
    tesla.locked = true
    autoExitOnLock(exitFn) // walk-away lock push
    expect(exitFn).not.toHaveBeenCalled()
  })

  test('car-initiated unlocked→locked while online → exit', () => {
    const exitFn = jest.fn()
    tesla.locked = false
    autoExitOnLock(exitFn) // saw unlocked
    tesla.locked = true
    autoExitOnLock(exitFn) // walk-away lock push
    expect(exitFn).toHaveBeenCalledTimes(1)
  })

  test('opened on an already-locked car → never exits', () => {
    const exitFn = jest.fn()
    tesla.locked = true
    autoExitOnLock(exitFn)
    autoExitOnLock(exitFn) // repeated locked notifies (pushes, renders)
    expect(exitFn).not.toHaveBeenCalled()
  })

  test('manual lock (noteSelfLock) → no exit; a later walk-away lock still exits', () => {
    const exitFn = jest.fn()
    tesla.locked = false
    autoExitOnLock(exitFn)
    noteSelfLock() // user tapped lock
    tesla.locked = true
    autoExitOnLock(exitFn) // optimistic flip from our own lock
    expect(exitFn).not.toHaveBeenCalled()
    // Car gets unlocked again, then walk-away locks itself → exit fires.
    tesla.locked = false
    autoExitOnLock(exitFn)
    tesla.locked = true
    autoExitOnLock(exitFn)
    expect(exitFn).toHaveBeenCalledTimes(1)
  })

  test('FAILED manual lock (clearSelfLock) → the next car-initiated lock still exits', () => {
    const exitFn = jest.fn()
    tesla.locked = false
    autoExitOnLock(exitFn)
    noteSelfLock() // user tapped lock…
    clearSelfLock() // …but it failed (refusal/timeout) — no flip is coming
    tesla.locked = true
    autoExitOnLock(exitFn) // walk-away lock push
    expect(exitFn).toHaveBeenCalledTimes(1)
  })

  test('leaving online resets tracking — a reconnect cannot exit off stale state', () => {
    const exitFn = jest.fn()
    tesla.locked = false
    autoExitOnLock(exitFn) // saw unlocked while online
    tesla.connection = { status: 'offline', error: null }
    autoExitOnLock(exitFn) // link dropped — tracking cleared
    tesla.connection = { status: 'online', error: null }
    tesla.locked = true
    autoExitOnLock(exitFn) // reconnect straight into locked state
    expect(exitFn).not.toHaveBeenCalled()
  })
})
