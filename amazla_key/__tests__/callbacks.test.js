/**
 * Unit tests for the page-level auto-lock / auto-unlock callbacks (page/callbacks.js).
 *
 * These own the settings-toggle policy (store.autoUnlock / store.autoLock); tesla is
 * spied so no BLE hardware is touched. Logic moved here from lib/tesla.js (lockOnClose)
 * on 2026-07-14 so tesla stays a pure key/transport facade.
 */

import { jest } from '@jest/globals'
import { autoLock, autoUnlock } from '../page/callbacks.js'
import tesla from '../lib/tesla.js'
import store from '../lib/store.js'
import { _fsStore } from '../__mocks__/zos.js'

beforeEach(() => {
  jest.clearAllMocks()
  Object.keys(_fsStore).forEach((k) => delete _fsStore[k])
  store.reset()
  // store.reset() keeps the user-pref toggles (they survive a vehicle unpair), so
  // clear them explicitly here or a prior test's value leaks into the next.
  store.autoUnlock = false
  store.autoLock = false
  tesla.connection = { status: 'online', error: null }
  tesla.locked = false
  tesla.userPresent = false
})

// ─── autoLock (app-close) ──────────────────────────────────────────────────────

describe('autoLock()', () => {
  // Auto-lock is an opt-in settings toggle (default OFF) — enable it for the gating
  // tests; the toggle itself is covered by its own test.
  beforeEach(() => {
    store.autoLock = true
  })

  test('online + unlocked + no driver → fires synchronous lock', () => {
    const spy = jest.spyOn(tesla, 'lockSync').mockReturnValue(true)
    expect(autoLock()).toBe(true)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  test('autoLock setting off (default) → no lock even when conditions match', () => {
    store.autoLock = false
    const spy = jest.spyOn(tesla, 'lockSync').mockReturnValue(true)
    expect(autoLock()).toBe(false)
    expect(spy).not.toHaveBeenCalled()
  })

  test('already locked → no lock', () => {
    tesla.locked = true
    const spy = jest.spyOn(tesla, 'lockSync').mockReturnValue(true)
    expect(autoLock()).toBe(false)
    expect(spy).not.toHaveBeenCalled()
  })

  test('driver present → no lock (never lock someone in/out)', () => {
    tesla.userPresent = true
    const spy = jest.spyOn(tesla, 'lockSync').mockReturnValue(true)
    expect(autoLock()).toBe(false)
    expect(spy).not.toHaveBeenCalled()
  })

  test('not connected → no lock', () => {
    tesla.connection.status = 'offline'
    const spy = jest.spyOn(tesla, 'lockSync').mockReturnValue(true)
    expect(autoLock()).toBe(false)
    expect(spy).not.toHaveBeenCalled()
  })
})

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
