/**
 * Unit tests for the page-level auto-lock / auto-unlock callbacks (page/callbacks.js).
 *
 * These own the settings-toggle policy (store.autoUnlock); tesla is
 * spied so no BLE hardware is touched. Logic moved here from lib/tesla.js (lockOnClose)
 * on 2026-07-14 so tesla stays a pure key/transport facade.
 */

import { jest } from '@jest/globals'
import { autoUnlock } from '../page/callbacks.js'
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

// ─── autoUnlock (connect) ──────────────────────────────────────────────────────

describe('autoUnlock()', () => {
  test('autoUnlock on + car locked → sends unlock', () => {
    store.autoUnlock = true
    tesla.locked = true
    const spy = jest.spyOn(tesla, 'unlock').mockImplementation(() => {})
    autoUnlock()
    expect(spy).toHaveBeenCalledTimes(1)
  })

  test('autoUnlock off (default) → no unlock', () => {
    tesla.locked = true
    const spy = jest.spyOn(tesla, 'unlock').mockImplementation(() => {})
    autoUnlock()
    expect(spy).not.toHaveBeenCalled()
  })

  test('already unlocked → no unlock even with toggle on', () => {
    store.autoUnlock = true
    tesla.locked = false
    const spy = jest.spyOn(tesla, 'unlock').mockImplementation(() => {})
    autoUnlock()
    expect(spy).not.toHaveBeenCalled()
  })
})
