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

  test('status fail → connection offline with error', () => {
    mockEstablished()
    jest.spyOn(teslaSession, 'getVehicleStatus')
      .mockImplementation(cb => cb({ success: false, error: 'No response' }))

    tesla.refresh()

    expect(tesla.connection.status).toBe('offline')
    expect(tesla.connection.error).toBe('No response')
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
