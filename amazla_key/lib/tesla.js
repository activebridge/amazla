import store from './store.js'
import { buildClosureMoveRequest, RKE_ACTION_LOCK, RKE_ACTION_UNLOCK } from './tesla-ble/protocol/vcsec.js'
import teslaSession from './tesla-ble/session.js'

var CLOSURE_REAR_TRUNK = 5
var CLOSURE_FRUNK = 6
var MOVE_OPEN = 0

class Tesla {
  constructor() {
    // Vehicle state — flat properties, mirrors BLE state
    this.locked = true
    this.df = false // front driver door
    this.dr = false // rear driver door
    this.pf = false // front passenger door
    this.pr = false // rear passenger door
    this.trunkOpen = false
    this.frunkOpen = false
    this.sleeping = false
    this.userPresent = false

    // Connection state
    this.connection = { status: 'checking', error: null }

    // Command in-flight guard
    this.busy = false

    this._listeners = []
  }

  // ── Computed getters ─────────────────────────────────────────────────

  get isPaired() {
    return store.isPaired
  }
  get name() {
    return store.vehicleName
  }
  get vin() {
    return store.vehicleVin
  }

  // ── Change notification ───────────────────────────────────────────────

  onChange(fn) {
    this._listeners.push(fn)
  }
  offChange(fn) {
    var arr = []
    for (var i = 0; i < this._listeners.length; i++) {
      if (this._listeners[i] !== fn) arr.push(this._listeners[i])
    }
    this._listeners = arr
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────

  connect() {
    this._setConnection({ status: 'checking', error: null })
    this.refresh()
  }

  // ── Car actions ───────────────────────────────────────────────────────

  lock(cb) {
    this._runAction((done) => {
      teslaSession.sendCommand(RKE_ACTION_LOCK, done)
    }, cb)
  }

  unlock(cb) {
    this._runAction((done) => {
      teslaSession.sendCommand(RKE_ACTION_UNLOCK, done)
    }, cb)
  }

  trunk(cb) {
    this._runAction((done) => {
      var cmr = buildClosureMoveRequest(CLOSURE_REAR_TRUNK, MOVE_OPEN)
      teslaSession.sendCommand({ closureMoveRequest: cmr }, done)
    }, cb)
  }

  frunk(cb) {
    this._runAction((done) => {
      var cmr = buildClosureMoveRequest(CLOSURE_FRUNK, MOVE_OPEN)
      teslaSession.sendCommand({ closureMoveRequest: cmr }, done)
    }, cb)
  }

  refresh(cb) {
    teslaSession.ensureSessionEstablished((r) => {
      if (!r.success) {
        this._setConnection({ status: 'offline', error: r.error || 'Could not connect' })
        if (cb) cb(r)
        return
      }
      teslaSession.getVehicleStatus((r2) => {
        if (!r2.success) {
          this._setConnection({ status: 'offline', error: r2.error || 'Status failed' })
          if (cb) cb(r2)
          return
        }
        this._applyStatus(r2.status)
        this._setConnection({ status: 'online', error: null })
        if (cb) cb({ success: true })
      })
    })
  }

  retry() {
    this._setConnection({ status: 'checking', error: null })
    this.refresh()
  }

  // ── Internal helpers ──────────────────────────────────────────────────

  _notify() {
    for (var i = 0; i < this._listeners.length; i++) {
      try {
        this._listeners[i]()
      } catch (_e) {}
    }
  }

  _applyStatus(status) {
    var cs = status.closureStatuses || {}
    this.locked = status.vehicleLockState === 1
    this.df = cs.frontDriverDoor === 1
    this.dr = cs.rearDriverDoor === 1
    this.pf = cs.frontPassengerDoor === 1
    this.pr = cs.rearPassengerDoor === 1
    this.trunkOpen = cs.rearTrunk === 1
    this.frunkOpen = cs.frontTrunk === 1
    this.sleeping = status.vehicleSleepStatus === 1
    this.userPresent = status.userPresence === 1
  }

  _setConnection(patch) {
    var changed = false
    if (patch.status !== undefined && patch.status !== this.connection.status) {
      this.connection.status = patch.status
      changed = true
    }
    if (patch.error !== undefined && patch.error !== this.connection.error) {
      this.connection.error = patch.error
      changed = true
    }
    if (changed) this._notify()
  }

  _runAction(fn, cb) {
    if (this.busy) {
      if (cb) cb({ success: false, error: 'Busy' })
      return
    }
    if (this.connection.status === 'offline' || this.connection.status === 'error') {
      if (cb) cb({ success: false, error: 'Offline — retry connection first' })
      return
    }
    this.busy = true
    this._notify()

    var self = this
    fn(function done(result) {
      // Two-response pattern: first callback is intermediate status push (_requeue=true).
      // Session layer re-arms its callback; we wait for the real response.
      if (result && result._requeue) return

      self.busy = false

      if (!result.success) {
        self._setConnection({ status: 'offline', error: result.error || 'Command failed' })
        self._notify()
        if (cb) cb(result)
        return
      }

      self._notify() // clear busy indicator immediately
      setTimeout(() => {
        self.refresh(() => {
          if (cb) cb({ success: true })
        })
      }, 1000)
    })
  }
}

const tesla = new Tesla()
export default tesla
