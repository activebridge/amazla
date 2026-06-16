/**
 * Unit tests for the Tesla facade (lib/tesla.js).
 *
 * teslaSession is spied on so tests never touch BLE hardware.
 * store is reset to a clean state before each test.
 */

import { jest } from '@jest/globals'
import tesla from '../lib/tesla.js'
import teslaSession from '../lib/tesla-ble/session.js'
import store from '../lib/store.js'
import { _fsStore } from '../__mocks__/zos.js'

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Reset the Tesla singleton to a known blank state */
function resetTesla() {
  tesla.locked      = true
  tesla.df          = false
  tesla.dr          = false
  tesla.pf          = false
  tesla.pr          = false
  tesla.trunkOpen   = false
  tesla.frunkOpen   = false
  tesla.sleeping    = false
  tesla.userPresent = false
  tesla.charge      = null
  tesla.connection  = { status: 'checking', error: null }
  tesla.busy        = false
  tesla._listeners  = []
}

/** Build a minimal protocol status object */
function makeStatus(patch = {}) {
  return {
    vehicleLockState:   0,
    vehicleSleepStatus: 0,
    userPresence:       0,
    closureStatuses: {
      frontDriverDoor:    0,
      rearDriverDoor:     0,
      frontPassengerDoor: 0,
      rearPassengerDoor:  0,
      rearTrunk:          0,
      frontTrunk:         0,
    },
    ...patch,
  }
}

/** Make ensureSessionEstablished resolve successfully */
function mockEstablished() {
  jest.spyOn(teslaSession, 'ensureSessionEstablished')
    .mockImplementation(cb => cb({ success: true }))
}

/** Make getVehicleStatus resolve with a status */
function mockGetStatus(statusPatch = {}) {
  jest.spyOn(teslaSession, 'getVehicleStatus')
    .mockImplementation(cb => cb({ success: true, status: makeStatus(statusPatch) }))
}

/** Make sendCommand call its callback once with a successful result */
function mockCommand() {
  jest.spyOn(teslaSession, 'sendCommand')
    .mockImplementation((_action, cb) => cb({ success: true, response: { actionStatus: 1 } }))
}

// ─── lifecycle ────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.useFakeTimers()
  jest.clearAllMocks()
  resetTesla()
  Object.keys(_fsStore).forEach(k => delete _fsStore[k])
  store.reset()
  // refresh() now always fires wake() before polling status, and loads charge
  // after. Default both to no-op successes so the connect-path tests don't hit
  // the real BLE implementations; tests that assert on them override these.
  jest.spyOn(teslaSession, 'wake').mockImplementation(cb => cb({ success: true }))
  jest.spyOn(teslaSession, 'getChargeState').mockImplementation(cb => cb({ success: false }))
})

afterEach(() => {
  jest.useRealTimers()
})

// ─── state initialization ─────────────────────────────────────────────────────

describe('state initialization', () => {
  test('vehicle state defaults: locked, all closed', () => {
    expect(tesla.locked).toBe(true)
    expect(tesla.df).toBe(false)
    expect(tesla.dr).toBe(false)
    expect(tesla.pf).toBe(false)
    expect(tesla.pr).toBe(false)
    expect(tesla.trunkOpen).toBe(false)
    expect(tesla.frunkOpen).toBe(false)
    expect(tesla.sleeping).toBe(false)
    expect(tesla.userPresent).toBe(false)
  })

  test('connection defaults to checking with no error', () => {
    expect(tesla.connection.status).toBe('checking')
    expect(tesla.connection.error).toBeNull()
  })

  test('busy starts false', () => {
    expect(tesla.busy).toBe(false)
  })
})

// ─── getters ──────────────────────────────────────────────────────────────────

describe('computed getters', () => {
  test('isPaired delegates to store.isPaired', () => {
    expect(tesla.isPaired).toBe(store.isPaired)
  })

  test('name returns store.vehicleName', () => {
    store.vehicleName = 'Model Y'
    expect(tesla.name).toBe('Model Y')
  })

  test('vin returns store.vehicleVin as bytes', () => {
    // store expects a binary string (as sent by phone companion)
    store.vehicleVin = 'AAAAAAAAAAAAAAAAA' // 17 × 'A' = 0x41
    expect(tesla.vin).toEqual(new Uint8Array(17).fill(0x41))
  })
})

// ─── onChange / offChange ─────────────────────────────────────────────────────

describe('onChange / offChange', () => {
  test('listener called when connection changes', () => {
    const fn = jest.fn()
    tesla.onChange(fn)
    tesla._setConnection({ status: 'online', error: null })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test('listener NOT called when value is unchanged', () => {
    tesla.connection.status = 'online'
    tesla.connection.error  = null
    const fn = jest.fn()
    tesla.onChange(fn)
    tesla._setConnection({ status: 'online', error: null })
    expect(fn).not.toHaveBeenCalled()
  })

  test('offChange removes listener', () => {
    const fn = jest.fn()
    tesla.onChange(fn)
    tesla.offChange(fn)
    tesla._setConnection({ status: 'online' })
    expect(fn).not.toHaveBeenCalled()
  })

  test('multiple listeners all fired', () => {
    const a = jest.fn()
    const b = jest.fn()
    tesla.onChange(a)
    tesla.onChange(b)
    tesla._setConnection({ status: 'online' })
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })

  test('throwing listener does not break other listeners', () => {
    const bad  = jest.fn(() => { throw new Error('boom') })
    const good = jest.fn()
    tesla.onChange(bad)
    tesla.onChange(good)
    expect(() => tesla._notify()).not.toThrow()
    expect(good).toHaveBeenCalledTimes(1)
  })
})

// ─── _applyStatus ─────────────────────────────────────────────────────────────

describe('_applyStatus', () => {
  test('locked=true when vehicleLockState=1', () => {
    tesla._applyStatus(makeStatus({ vehicleLockState: 1 }))
    expect(tesla.locked).toBe(true)
  })

  test('absent snapshot is a no-op, not a throw', () => {
    // Field-3 VCSEC proximity/auth pushes decode to no usable snapshot.
    tesla.locked = true
    expect(() => tesla._applyStatus(undefined)).not.toThrow()
    expect(tesla.locked).toBe(true)
  })

  test('locked=false when vehicleLockState=0', () => {
    tesla.locked = true
    tesla._applyStatus(makeStatus({ vehicleLockState: 0 }))
    expect(tesla.locked).toBe(false)
  })

  test('door flags map correctly', () => {
    tesla._applyStatus(makeStatus({
      closureStatuses: {
        frontDriverDoor: 1, rearDriverDoor: 1,
        frontPassengerDoor: 0, rearPassengerDoor: 0,
        rearTrunk: 0, frontTrunk: 0,
      },
    }))
    expect(tesla.df).toBe(true)
    expect(tesla.dr).toBe(true)
    expect(tesla.pf).toBe(false)
    expect(tesla.pr).toBe(false)
  })

  test('trunkOpen=true when rearTrunk=1', () => {
    tesla._applyStatus(makeStatus({
      closureStatuses: {
        frontDriverDoor: 0, rearDriverDoor: 0,
        frontPassengerDoor: 0, rearPassengerDoor: 0,
        rearTrunk: 1, frontTrunk: 0,
      },
    }))
    expect(tesla.trunkOpen).toBe(true)
    expect(tesla.frunkOpen).toBe(false)
  })

  test('frunkOpen=true when frontTrunk=1', () => {
    tesla._applyStatus(makeStatus({
      closureStatuses: {
        frontDriverDoor: 0, rearDriverDoor: 0,
        frontPassengerDoor: 0, rearPassengerDoor: 0,
        rearTrunk: 0, frontTrunk: 1,
      },
    }))
    expect(tesla.frunkOpen).toBe(true)
    expect(tesla.trunkOpen).toBe(false)
  })

  test('sleeping and userPresent map correctly', () => {
    tesla._applyStatus(makeStatus({ vehicleSleepStatus: 1, userPresence: 1 }))
    expect(tesla.sleeping).toBe(true)
    expect(tesla.userPresent).toBe(true)
  })
})

// ─── cached state snapshot ────────────────────────────────────────────────────
// The car can take 10–20s to volunteer its first VehicleStatus on a fresh
// connection (device captures 2026-06-11), so the last applied state is
// persisted and painted immediately on the next app load.

describe('cached state snapshot', () => {
  test('_applyStatus persists the snapshot to store.lastVehicleState', () => {
    tesla._applyStatus(makeStatus({ vehicleLockState: 0, userPresence: 1 }))
    const cached = store.lastVehicleState
    expect(cached).not.toBeNull()
    expect(cached.locked).toBe(false)
    expect(cached.userPresent).toBe(true)
    expect(cached.trunkOpen).toBe(false)
  })

  test('redundant snapshot (no change) does not rewrite the cache', () => {
    tesla._applyStatus(makeStatus({ vehicleLockState: 0 }))
    store.lastVehicleState = null
    tesla._applyStatus(makeStatus({ vehicleLockState: 0 })) // same state again
    expect(store.lastVehicleState).toBeNull() // unchanged → not persisted
  })

  test('_hydrateCachedState paints the persisted snapshot over the defaults', () => {
    store.lastVehicleState = { locked: false, chargePortOpen: true }
    tesla.locked = true
    tesla.chargePortOpen = false
    tesla._hydrateCachedState()
    expect(tesla.locked).toBe(false)
    expect(tesla.chargePortOpen).toBe(true)
    expect(tesla.df).toBe(false) // keys absent from the cache keep their defaults
  })

  test('hydrate is a no-op when nothing is cached', () => {
    store.lastVehicleState = null
    tesla.locked = true
    expect(() => tesla._hydrateCachedState()).not.toThrow()
    expect(tesla.locked).toBe(true)
  })

  test('non-boolean values in the cache are ignored (no type smuggling into the UI)', () => {
    store.lastVehicleState = { locked: 'nope', trunkOpen: 1 }
    tesla.locked = true
    tesla._hydrateCachedState()
    expect(tesla.locked).toBe(true)
    expect(tesla.trunkOpen).toBe(false)
  })
})

// ─── charge block (infotainment, pull-only) ───────────────────────────────────
// Charge data comes from GetVehicleData (no pushes), so it lives in a separate
// `charge` block carrying its own capture time. One state blob, two independent
// writers (VCSEC push + charge fetch) that must not clobber each other.

describe('charge state snapshot', () => {
  test('_applyChargeState stamps a timestamp and persists into the same blob', () => {
    tesla._applyChargeState({ level: 70, range: 198, state: 'Disconnected' })
    expect(tesla.charge.level).toBe(70)
    expect(tesla.charge.range).toBe(198)
    expect(tesla.charge.state).toBe('Disconnected')
    expect(typeof tesla.charge.ts).toBe('number')
    expect(store.lastVehicleState.charge.level).toBe(70)
  })

  test('a VCSEC status update preserves an existing charge block', () => {
    tesla._applyChargeState({ level: 70, range: 198, state: 'Charging' })
    tesla._applyStatus(makeStatus({ vehicleLockState: 1 })) // different writer
    expect(store.lastVehicleState.locked).toBe(true)
    expect(store.lastVehicleState.charge.level).toBe(70) // not clobbered
  })

  test('a charge update preserves the VCSEC fields', () => {
    tesla._applyStatus(makeStatus({ vehicleLockState: 0, vehicleSleepStatus: 1 }))
    tesla._applyChargeState({ level: 42, range: 110, state: 'Complete' })
    expect(store.lastVehicleState.locked).toBe(false)
    expect(store.lastVehicleState.sleeping).toBe(true)
    expect(store.lastVehicleState.charge.level).toBe(42)
  })

  test('_hydrateCachedState restores the charge block', () => {
    store.lastVehicleState = { locked: false, charge: { level: 55, range: 150, state: 'Charging', ts: 123 } }
    tesla._hydrateCachedState()
    expect(tesla.locked).toBe(false)
    expect(tesla.charge.level).toBe(55)
    expect(tesla.charge.ts).toBe(123)
  })

  test('hydrate ignores a non-object charge value', () => {
    store.lastVehicleState = { locked: true, charge: 'oops' }
    tesla.charge = null
    tesla._hydrateCachedState()
    expect(tesla.charge).toBeNull()
  })

  test('_applyChargeState is a no-op on null (no charge data yet)', () => {
    tesla.charge = null
    tesla._applyChargeState(null)
    expect(tesla.charge).toBeNull()
  })

  test('fetchChargeState applies a successful session result', () => {
    jest.spyOn(teslaSession, 'getChargeState')
      .mockImplementation(cb => cb({ success: true, charge: { level: 64, range: 175, state: 'Disconnected' } }))
    const cb = jest.fn()
    tesla.fetchChargeState(cb)
    expect(tesla.charge.level).toBe(64)
    expect(tesla.charge.state).toBe('Disconnected')
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ success: true }))
  })

  test('fetchChargeState failure leaves existing charge untouched', () => {
    tesla._applyChargeState({ level: 90, range: 250, state: 'Complete' })
    jest.spyOn(teslaSession, 'getChargeState')
      .mockImplementation(cb => cb({ success: false, error: 'timeout' }))
    tesla.fetchChargeState()
    expect(tesla.charge.level).toBe(90) // unchanged
  })

  test('refresh loads charge after a successful status fetch', () => {
    mockEstablished()
    mockGetStatus({ vehicleLockState: 1 })
    const chargeSpy = jest.spyOn(teslaSession, 'getChargeState')
      .mockImplementation(cb => cb({ success: true, charge: { level: 71, range: 200, state: 'Charging' } }))
    tesla.refresh()
    expect(chargeSpy).toHaveBeenCalled()
    expect(tesla.charge.level).toBe(71)
  })
})

// ─── connect() ────────────────────────────────────────────────────────────────

describe('connect()', () => {
  test('sets connection to checking and calls refresh', () => {
    mockEstablished()
    mockGetStatus()
    const listener = jest.fn()
    tesla.onChange(listener)

    tesla.connect()

    // Should immediately set 'checking' (if not already) and trigger refresh
    expect(teslaSession.ensureSessionEstablished).toHaveBeenCalledTimes(1)
  })
})

// ─── refresh() ────────────────────────────────────────────────────────────────

describe('refresh()', () => {
  test('success path: connection becomes online, state applied', () => {
    mockEstablished()
    mockGetStatus({ vehicleLockState: 0 })

    const listener = jest.fn()
    tesla.onChange(listener)
    tesla.refresh()

    expect(tesla.connection.status).toBe('online')
    expect(tesla.locked).toBe(false)
    expect(listener).toHaveBeenCalled()
  })

  test('session fail → connection offline with error', () => {
    jest.spyOn(teslaSession, 'ensureSessionEstablished')
      .mockImplementation(cb => cb({ success: false, error: 'BLE timeout' }))

    tesla.refresh()

    expect(tesla.connection.status).toBe('offline')
    expect(tesla.connection.error).toBe('BLE timeout')
  })

  test('"disconnected during setup" → auto-retries once and connects', () => {
    jest.useFakeTimers()
    try {
      let calls = 0
      jest.spyOn(teslaSession, 'ensureSessionEstablished').mockImplementation((cb) => {
        calls++
        if (calls === 1) cb({ success: false, error: 'Vehicle disconnected during setup' })
        else cb({ success: true })
      })
      mockGetStatus()

      tesla.refresh()
      // First attempt failed transiently → stays in "checking", not "offline".
      expect(tesla.connection.status).toBe('checking')

      jest.advanceTimersByTime(800) // fire the retry
      expect(calls).toBe(2)
      expect(tesla.connection.status).toBe('online')
    } finally {
      jest.useRealTimers()
    }
  })

  test('"disconnected during setup" twice → gives up after one retry (offline)', () => {
    jest.useFakeTimers()
    try {
      jest.spyOn(teslaSession, 'ensureSessionEstablished')
        .mockImplementation((cb) => cb({ success: false, error: 'Vehicle disconnected during setup' }))

      tesla.refresh()
      jest.advanceTimersByTime(800)
      // Only one retry; the second failure is terminal.
      expect(tesla.connection.status).toBe('offline')
      expect(tesla.connection.error).toMatch(/during setup/)
    } finally {
      jest.useRealTimers()
    }
  })

  test('status fail stays ONLINE (session up) — state loads from live pushes', () => {
    // Once the session is established the link works; a getVehicleStatus timeout on the
    // passive-entry beacon flood must NOT read as "connection failed". Live pushes carry
    // the initial state instead.
    mockEstablished()
    jest.spyOn(teslaSession, 'getVehicleStatus')
      .mockImplementation(cb => cb({ success: false, error: 'No response' }))
    jest.spyOn(teslaSession, 'wake').mockImplementation(cb => cb({ success: true }))
    const liveSpy = jest.spyOn(teslaSession, 'startStatusPushListener')

    tesla.refresh()

    expect(tesla.connection.status).toBe('online')
    expect(tesla.connection.error).toBe(null)
    expect(liveSpy).toHaveBeenCalled()
  })

  // GET_STATUS answers only once the passive-entry handshake progresses (device
  // 2026-06-15: first status ~21s after Established). A single attempt timed out long
  // before that and left a STALE lock state shown — which misfires the toggle button.
  // So we poll until a status lands (re-waking each round), bounded by a budget; and
  // charge loads whether status succeeds or the budget runs out (never gated).
  test('silent status → polls to budget, then loads charge (decoupled)', () => {
    mockEstablished()
    const timeouts = []
    let calls = 0
    jest.spyOn(teslaSession, 'getVehicleStatus')
      .mockImplementation((cb, timeoutMs) => { timeouts.push(timeoutMs); calls++; cb({ success: false, error: 'Vehicle status timed out' }) })
    const wakeSpy = jest.spyOn(teslaSession, 'wake').mockImplementation(cb => cb({ success: true }))
    const chargeSpy = jest.spyOn(teslaSession, 'getChargeState')
      .mockImplementation(cb => cb({ success: true, charge: { level: 60, range: 150, state: 'Disconnected' } }))

    tesla.refresh()

    expect(timeouts[0]).toBe(3000) // short per-poll deadline — fall through fast
    expect(wakeSpy).toHaveBeenCalled()
    expect(calls).toBe(6) // bounded retry loop (MAX_POLLS), no infinite spin
    expect(chargeSpy).toHaveBeenCalledTimes(1) // charge loads despite status never answering
  })

  // A status that lands stops the poll loop immediately and applies fresh lock state.
  test('status answered on 2nd poll → applies state, stops polling, loads charge', () => {
    mockEstablished()
    let calls = 0
    jest.spyOn(teslaSession, 'getVehicleStatus')
      .mockImplementation((cb) => {
        calls++
        if (calls === 1) { cb({ success: false, error: 'timed out' }); return }
        cb({ success: true, status: makeStatus({ vehicleLockState: 0 }) }) // unlocked
      })
    jest.spyOn(teslaSession, 'wake').mockImplementation(cb => cb({ success: true }))
    const chargeSpy = jest.spyOn(teslaSession, 'getChargeState')
      .mockImplementation(cb => cb({ success: true, charge: { level: 60, range: 150, state: 'Disconnected' } }))

    tesla.refresh()

    expect(calls).toBe(2) // stopped as soon as status landed
    expect(tesla.locked).toBe(false) // fresh state applied (fixes the toggle)
    expect(chargeSpy).toHaveBeenCalledTimes(1)
  })

  test('wake is fired on connect, then charge loads after status settles', () => {
    mockEstablished()
    mockGetStatus({ vehicleLockState: 1 })
    const wakeSpy = jest.spyOn(teslaSession, 'wake').mockImplementation(cb => cb({ success: true }))
    const chargeSpy = jest.spyOn(teslaSession, 'getChargeState')
      .mockImplementation(cb => cb({ success: true, charge: { level: 60, range: 150, state: 'Disconnected' } }))
    tesla.refresh()
    expect(wakeSpy).toHaveBeenCalled()   // wake always fires (handles the dozing-car case)
    expect(tesla.locked).toBe(true)      // status applied
    expect(chargeSpy).toHaveBeenCalledTimes(1) // charge loaded once
  })

  // getVehicleStatus re-invokes its callback with _requeue on every unsolicited
  // beacon. Device 2026-06-12: refresh treated those as terminal and fired a fresh
  // charge fetch per beacon, each grabbing the BLE slot for ~15s and starving the
  // status request — so live state never loaded and the UI stayed on stale cache.
  test('beacon (_requeue) frames during status do NOT trigger charge fetches', () => {
    mockEstablished()
    jest.spyOn(teslaSession, 'getVehicleStatus').mockImplementation((cb) => {
      cb({ success: true, _requeue: true })            // beacon
      cb({ success: true, _requeue: true })            // beacon
      cb({ success: true, status: makeStatus({ vehicleLockState: 1 }) }) // terminal
    })
    const chargeSpy = jest.spyOn(teslaSession, 'getChargeState')
      .mockImplementation(cb => cb({ success: true, charge: { level: 50, range: 120, state: 'Disconnected' } }))
    tesla.refresh()
    expect(chargeSpy).toHaveBeenCalledTimes(1) // once, only after the terminal status
    expect(tesla.locked).toBe(true)
  })

  test('calls optional callback with success', () => {
    mockEstablished()
    mockGetStatus()
    const cb = jest.fn()
    tesla.refresh(cb)
    expect(cb).toHaveBeenCalledWith({ success: true })
  })

  test('calls optional callback with error on session fail', () => {
    jest.spyOn(teslaSession, 'ensureSessionEstablished')
      .mockImplementation(cb => cb({ success: false, error: 'fail' }))
    const cb = jest.fn()
    tesla.refresh(cb)
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ success: false }))
  })
})

// ─── retry() ──────────────────────────────────────────────────────────────────

describe('retry()', () => {
  test('sets connection to checking then refreshes', () => {
    mockEstablished()
    mockGetStatus()
    tesla.connection.status = 'offline'

    tesla.retry()

    expect(teslaSession.ensureSessionEstablished).toHaveBeenCalledTimes(1)
    expect(tesla.connection.status).toBe('online')
  })
})

// ─── lock / unlock ────────────────────────────────────────────────────────────

describe('lock()', () => {
  test('calls sendCommand with RKE_ACTION_LOCK (1)', () => {
    tesla.connection.status = 'online'
    mockCommand()
    mockEstablished()
    mockGetStatus()

    tesla.lock()

    expect(teslaSession.sendCommand).toHaveBeenCalledWith(
      1, // RKE_ACTION_LOCK
      expect.any(Function),
    )
  })

  test('sets busy=true while running, false after', () => {
    tesla.connection.status = 'online'
    let capturedBusy = null
    jest.spyOn(teslaSession, 'sendCommand').mockImplementation((_action, cb) => {
      capturedBusy = tesla.busy
      cb({ success: true, response: { actionStatus: 1 } })
    })
    mockEstablished()
    mockGetStatus()

    tesla.lock()
    expect(capturedBusy).toBe(true)
    // After success callback: busy cleared, then setTimeout(refresh, 1000)
    expect(tesla.busy).toBe(false)
  })

  test('calls cb with success after auto-refresh completes', () => {
    tesla.connection.status = 'online'
    mockCommand()
    mockEstablished()
    mockGetStatus()
    const cb = jest.fn()

    tesla.lock(cb)
    jest.advanceTimersByTime(1000)

    expect(cb).toHaveBeenCalledWith({ success: true })
  })

  test('notifies listener on busy change', () => {
    tesla.connection.status = 'online'
    mockCommand()
    mockEstablished()
    mockGetStatus()

    const listener = jest.fn()
    tesla.onChange(listener)
    tesla.lock()

    expect(listener).toHaveBeenCalled()
  })

  test('skips post-command refresh if user issued another command in 1s gap', () => {
    tesla.connection.status = 'online'
    mockCommand()
    mockEstablished()
    const statusSpy = jest.spyOn(teslaSession, 'getVehicleStatus')
      .mockImplementation(cb => cb({ success: true, status: makeStatus() }))

    const cb = jest.fn()
    tesla.lock(cb)
    // First command done, busy=false. User taps again within the 1s window:
    tesla.busy = true
    jest.advanceTimersByTime(1000)

    // Refresh must be skipped — new command's refresh will handle it
    expect(statusSpy).not.toHaveBeenCalled()
    expect(cb).toHaveBeenCalledWith({ success: true })
  })
})

describe('unlock()', () => {
  test('calls sendCommand with RKE_ACTION_UNLOCK (0)', () => {
    tesla.connection.status = 'online'
    mockCommand()
    mockEstablished()
    mockGetStatus()

    tesla.unlock()

    expect(teslaSession.sendCommand).toHaveBeenCalledWith(
      0, // RKE_ACTION_UNLOCK
      expect.any(Function),
    )
  })
})

// ─── trunk / frunk ────────────────────────────────────────────────────────────

describe('trunk()', () => {
  test('calls sendCommand with closure object (not a number)', () => {
    tesla.connection.status = 'online'
    mockCommand()
    mockEstablished()
    mockGetStatus()

    tesla.trunk()

    const [firstArg] = teslaSession.sendCommand.mock.calls[0]
    expect(typeof firstArg).toBe('object')
    expect(firstArg.closureMoveRequest).toBeInstanceOf(Uint8Array)
  })
})

describe('frunk()', () => {
  test('calls sendCommand with closure object', () => {
    tesla.connection.status = 'online'
    mockCommand()
    mockEstablished()
    mockGetStatus()

    tesla.frunk()

    const [firstArg] = teslaSession.sendCommand.mock.calls[0]
    expect(typeof firstArg).toBe('object')
    expect(firstArg.closureMoveRequest).toBeInstanceOf(Uint8Array)
  })
})

describe('chargePort()', () => {
  test('delegates to the infotainment (AES-GCM) path, not the VCSEC closure', () => {
    tesla.connection.status = 'online'
    const inf = jest.spyOn(teslaSession, 'chargePortInfotainment').mockImplementation((cb) => cb({ success: true }))
    mockEstablished()
    mockGetStatus()

    tesla.chargePort()

    expect(inf).toHaveBeenCalledTimes(1)
  })
})

// ─── guards ───────────────────────────────────────────────────────────────────

describe('busy guard', () => {
  test('second action rejected while first in flight', () => {
    tesla.connection.status = 'online'
    // sendCommand never calls back → busy stays true
    jest.spyOn(teslaSession, 'sendCommand').mockImplementation(() => {})

    tesla.lock()
    expect(tesla.busy).toBe(true)

    const cb = jest.fn()
    tesla.unlock(cb)
    expect(cb).toHaveBeenCalledWith({ success: false, error: 'Busy' })
  })
})

describe('offline guard', () => {
  test('action rejected when status is offline', () => {
    tesla.connection.status = 'offline'
    const cb = jest.fn()
    tesla.lock(cb)
    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.stringMatching(/offline/i) }),
    )
    expect(teslaSession.sendCommand).not.toHaveBeenCalled()
  })
})

// ─── two-response pattern ─────────────────────────────────────────────────────

describe('two-response pattern', () => {
  test('_requeue result does not clear busy or call cb', () => {
    tesla.connection.status = 'online'
    const cb = jest.fn()

    jest.spyOn(teslaSession, 'sendCommand').mockImplementation((_action, done) => {
      // First response: intermediate status push
      done({ _requeue: true })
    })

    tesla.lock(cb)

    // busy still set — waiting for second response
    expect(tesla.busy).toBe(true)
    expect(cb).not.toHaveBeenCalled()
  })

  test('second response with success clears busy and calls cb', () => {
    tesla.connection.status = 'online'
    mockEstablished()
    mockGetStatus()
    const cb = jest.fn()

    jest.spyOn(teslaSession, 'sendCommand').mockImplementation((_action, done) => {
      done({ _requeue: true })                             // first: ack
      done({ success: true, response: { actionStatus: 1 } }) // second: real result
    })

    tesla.lock(cb)
    expect(tesla.busy).toBe(false)
    jest.advanceTimersByTime(1000)
    expect(cb).toHaveBeenCalledWith({ success: true })
  })
})

// ─── command failure ──────────────────────────────────────────────────────────

describe('command failure', () => {
  test('failed sendCommand sets connection offline and calls cb with error', () => {
    tesla.connection.status = 'online'
    jest.spyOn(teslaSession, 'sendCommand')
      .mockImplementation((_action, done) => done({ success: false, error: 'HMAC failed' }))

    const cb = jest.fn()
    tesla.lock(cb)

    expect(tesla.connection.status).toBe('offline')
    expect(tesla.busy).toBe(false)
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ success: false }))
  })
})

// ─── app-close auto-lock ────────────────────────────────────────────────────────

describe('lockOnClose', () => {
  test('online + unlocked + no driver → fires synchronous lock', () => {
    tesla.connection.status = 'online'
    tesla.locked = false
    tesla.userPresent = false
    const spy = jest.spyOn(teslaSession, 'lockSyncFireAndForget').mockReturnValue(true)

    expect(tesla.lockOnClose()).toBe(true)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  test('already locked → no lock', () => {
    tesla.connection.status = 'online'
    tesla.locked = true
    tesla.userPresent = false
    const spy = jest.spyOn(teslaSession, 'lockSyncFireAndForget').mockReturnValue(true)

    expect(tesla.lockOnClose()).toBe(false)
    expect(spy).not.toHaveBeenCalled()
  })

  test('driver present → no lock (never lock someone in/out)', () => {
    tesla.connection.status = 'online'
    tesla.locked = false
    tesla.userPresent = true
    const spy = jest.spyOn(teslaSession, 'lockSyncFireAndForget').mockReturnValue(true)

    expect(tesla.lockOnClose()).toBe(false)
    expect(spy).not.toHaveBeenCalled()
  })

  test('not connected → no lock', () => {
    tesla.connection.status = 'offline'
    tesla.locked = false
    tesla.userPresent = false
    const spy = jest.spyOn(teslaSession, 'lockSyncFireAndForget').mockReturnValue(true)

    expect(tesla.lockOnClose()).toBe(false)
    expect(spy).not.toHaveBeenCalled()
  })
})
