import store from './store.js'
import teslaSession from './tesla-ble/session.js'

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
    this.chargePortOpen = false
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
    this._runAction((done) => teslaSession.lock(done), cb)
  }

  unlock(cb) {
    this._runAction((done) => teslaSession.unlock(done), cb)
  }

  trunk(cb) {
    this._runAction((done) => teslaSession.trunk(done), cb)
  }

  frunk(cb) {
    this._runAction((done) => teslaSession.frunk(done), cb)
  }

  refresh(cb, _isRetry) {
    teslaSession.ensureSessionEstablished((r) => {
      if (!r.success) {
        // The car occasionally drops the BLE link mid-GATT-setup ("disconnected
        // during setup") — pure transient flakiness that clears on a fresh dial.
        // Auto-retry once after a short delay so the user doesn't have to tap again.
        if (!_isRetry && r.error && r.error.indexOf('during setup') !== -1) {
          this._setConnection({ status: 'checking', error: null })
          setTimeout(() => this.refresh(cb, true), 800)
          return
        }
        this._setConnection({ status: 'offline', error: r.error || 'Could not connect' })
        if (cb) cb(r)
        return
      }
      // Session is established here — the link works. Report online and arm live
      // pushes BEFORE the status fetch, so a getVehicleStatus that times out on the
      // auth-beacon flood (passive entry ON) doesn't read as "connection failed".
      // Initial state then loads from the first status push the car streams.
      this._setConnection({ status: 'online', error: null })
      this._startLivePushes()
      teslaSession.getVehicleStatus((r2) => {
        if (r2.success) this._applyStatus(r2.status)
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
    // Field-3 VCSEC frames (proximity/auth pushes) decode to no usable snapshot,
    // so status can be absent. Skip rather than throw — a missing snapshot is a
    // no-op, not an error, and throwing here surfaced as a bogus
    // "getVehicleStatus error: closureStatuses of undefined" up the callback.
    if (!status) return
    var cs = status.closureStatuses || {}
    var next = {
      locked: status.vehicleLockState === 1,
      df: cs.frontDriverDoor === 1,
      dr: cs.rearDriverDoor === 1,
      pf: cs.frontPassengerDoor === 1,
      pr: cs.rearPassengerDoor === 1,
      trunkOpen: cs.rearTrunk === 1,
      frunkOpen: cs.frontTrunk === 1,
      chargePortOpen: cs.chargePort === 1,
      sleeping: status.vehicleSleepStatus === 1,
      userPresent: status.userPresence === 1,
    }
    // Re-render only when the car's reported state differs from what's on the
    // watch — so a live VehicleStatus push (door opened) repaints, while a
    // redundant snapshot is a no-op.
    var changed = false
    for (var k in next) {
      if (this[k] !== next[k]) {
        this[k] = next[k]
        changed = true
      }
    }
    if (changed) this._notify()
  }

  _startLivePushes() {
    teslaSession.startStatusPushListener((status) => {
      this._applyStatus(status)
    })
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
        if (self.busy) {
          if (cb) cb({ success: true })
          return
        }
        self.refresh(() => {
          if (cb) cb({ success: true })
        })
      }, 1000)
    })
  }
}

const tesla = new Tesla()
export default tesla
