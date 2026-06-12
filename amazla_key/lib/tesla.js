import store from './store.js'
import teslaSession from './tesla-ble/session.js'

// The flat VCSEC vehicle-state booleans, in one place so the cached-snapshot
// persist/hydrate below can't drift from the properties the UI renders. These are
// PUSH-driven: while connected, the car streams VehicleStatus so they stay live —
// no timestamp needed. Pull-only data (charge, from the infotainment domain) lives
// in a separate `charge` block with its own capture time (see _applyChargeState).
var VCSEC_STATE_KEYS = ['locked', 'df', 'dr', 'pf', 'pr', 'trunkOpen', 'frunkOpen', 'chargePortOpen', 'sleeping', 'userPresent']

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
    // Charge snapshot from the infotainment domain (GetChargeState). PULL-only —
    // the car sends no charge pushes, so this is a point-in-time snapshot with a
    // capture timestamp the UI can age. null until the first fetch decodes.
    // Shape: { level, range, state, ts }.
    this.charge = null
    this._hydrateCachedState()

    // Connection state
    this.connection = { status: 'checking', error: null }

    // Command in-flight guard
    this.busy = false

    this._listeners = []
  }

  // Paint the last-known state immediately on load. The car can take 10–20s to
  // volunteer its first VehicleStatus (a dozing car ignores GET_STATUS until
  // woken — device captures 2026-06-11), and until then the defaults above read
  // as "wrong state". Live pushes correct drift; the charge block carries its own
  // age so stale pull-only data can be dimmed rather than trusted.
  _hydrateCachedState() {
    var cached = store.lastVehicleState
    if (!cached) return
    for (var i = 0; i < VCSEC_STATE_KEYS.length; i++) {
      var k = VCSEC_STATE_KEYS[i]
      if (typeof cached[k] === 'boolean') this[k] = cached[k]
    }
    if (cached.charge && typeof cached.charge === 'object') this.charge = cached.charge
  }

  // Persist the whole state blob from the in-memory object. `this` is the single
  // source of truth both writers update (VCSEC push → _applyStatus, infotainment
  // fetch → _applyChargeState), so rebuilding the snapshot from it can't let one
  // path clobber the other's fields — no read-modify-write of storage needed.
  _persistState() {
    var snap = {}
    for (var i = 0; i < VCSEC_STATE_KEYS.length; i++) snap[VCSEC_STATE_KEYS[i]] = this[VCSEC_STATE_KEYS[i]]
    if (this.charge) snap.charge = this.charge
    store.lastVehicleState = snap
  }

  // Apply a decoded GetChargeState snapshot (infotainment domain). Stamps it with
  // the capture time so the UI can show/dim "as of N min ago" — pull-only data
  // goes stale silently (a cached "Charging" for an unplugged car would mislead).
  _applyChargeState(charge) {
    if (!charge) return
    this.charge = {
      level: charge.level,         // battery_level, %
      range: charge.range,         // battery_range, mi
      state: charge.state,         // ChargingState: Disconnected/Charging/Complete/…
      ts: Math.floor(Date.now() / 1000),
    }
    this._persistState()
    this._notify()
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

  chargePort(cb) {
    // Routes to the infotainment (AES-GCM) path — the SDK-correct domain for charge
    // port. teslaSession.chargePort (VCSEC closure) is kept for comparison but the
    // button uses this. EXPERIMENTAL: needs car capture to validate.
    this._runAction((done) => teslaSession.chargePortInfotainment(done), cb)
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
      // Session is established here — the link works. Report online + arm live
      // pushes immediately so the UI shows the (cached) car at once, and a status
      // fetch that times out under the beacon flood never reads as "offline".
      this._setConnection({ status: 'online', error: null })
      this._startLivePushes()
      if (cb) cb({ success: true }) // online now; live state refines as it arrives
      this._loadInitialState()
    })
  }

  // Load live state on connect. The hard case is a DOZING car: it keeps VCSEC
  // beaconing (passive entry works) but ignores GET_STATUS until it fully wakes —
  // device 2026-06-12 showed ~30s and nothing addressed until then. The old flow
  // stacked 15s timeouts serially (status → wake-ack → status → charge), so even
  // once the car woke it took ~40s to surface. Instead: fire a quick wake, then
  // POLL status with short deadlines, stopping the moment one is answered — so we
  // catch the wake-up within a few seconds of it happening, not 15s later.
  _loadInitialState() {
    var POLL_MS = 4000
    var MAX_POLLS = 7 // ~28s budget covering a cold wake; cached state shows meanwhile
    var attempts = 0
    var done = false
    var self = this
    var poll = function () {
      teslaSession.getVehicleStatus(function (r) {
        if (r && r._requeue) return // beacon notification, not terminal — keep waiting
        if (done) return
        if (r.success) {
          done = true
          self._applyStatus(r.status)
          // Charge ONLY once status proves the car is awake. A charge fetch holds
          // the BLE slot (and gates the passive-entry responder) for its deadline;
          // firing it at a dozing car that won't answer would freeze walk-up
          // unlock for no payoff (device 2026-06-12). Cached charge shows meanwhile.
          self._loadChargeState()
          return
        }
        attempts++
        if (attempts >= MAX_POLLS) { done = true; return } // dozing — give up, don't hog the slot on charge
        poll()
      }, POLL_MS)
    }
    // Fire wake first (short, non-blocking — a deep-asleep car never ACKs it, the
    // wake happens on TX), then start polling once the slot is free again.
    teslaSession.wake(function () { poll() })
  }

  // Fetch the charge snapshot (infotainment domain) AFTER the VCSEC status work
  // settles — they share the one BLE response slot, so this must run sequentially,
  // not concurrently. Best-effort: a failure leaves the cached charge in place.
  _loadChargeState(cb) {
    teslaSession.getChargeState((r) => {
      if (r.success) this._applyChargeState(r.charge)
      if (cb) cb(r)
    })
  }

  // Manual refresh of just the charge snapshot (e.g. a pull-to-refresh on the
  // charge view) without re-running the whole connect/status flow.
  fetchChargeState(cb) {
    this._loadChargeState(cb)
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
    if (changed) {
      // Persist the snapshot so the next app load paints it instantly
      // (see _hydrateCachedState). Preserves the charge block.
      this._persistState()
      this._notify()
    }
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
