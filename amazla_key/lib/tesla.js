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
      level: charge.level, // battery_level, %
      range: charge.range, // battery_range, mi
      limit: charge.limit, // charge_limit_soc, % (SOC target; null if absent)
      minsToFull: charge.minsToFull, // minutes_to_full_charge (null if absent)
      state: charge.state, // ChargingState: Disconnected/Charging/Complete/…
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

  // Single mutually-exclusive "what is the car doing" token, mirroring the Tesla
  // Apple Watch app (parked / charging / charged / asleep). Asleep wins (the car
  // is unreachable); then charge activity; else parked. Driving isn't derivable —
  // we don't decode shift/gear state — so an occupied-but-parked car reads parked.
  // Returns an i18n token; the UI resolves it via getText('charge_<token>').
  get primaryState() {
    if (this.sleeping) return 'asleep'
    var s = this.charge && this.charge.state
    if (s === 'Charging' || s === 'Starting') return 'charging'
    if (s === 'Complete') return 'charged'
    return 'parked'
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

  // Start/stop charging (only when a cable is connected — see `pluggedIn`). Same
  // infotainment actuation path as chargePort. EXPERIMENTAL: not device-validated.
  startCharge(cb) {
    this._runAction((done) => teslaSession.chargeStart(done), cb)
  }
  stopCharge(cb) {
    this._runAction((done) => teslaSession.chargeStop(done), cb)
  }

  // True when a charge cable is connected (any charging_state except Disconnected/
  // Unknown). Drives the charge button: port open/close when unplugged, start/stop
  // charge when plugged in.
  get pluggedIn() {
    var s = this.charge && this.charge.state
    return !!s && s !== 'Disconnected' && s !== 'Unknown'
  }

  refresh(cb) {
    teslaSession.ensureSessionEstablished((r) => {
      if (!r.success) {
        // Cold-connect drops ("disconnected during setup") are retried inside the
        // connect path now (session.js _doConnect re-dials up to MAX_CONNECT_ATTEMPTS,
        // each bounded by the ble.js setup watchdog) — mirrors the Tesla Go SDK. By
        // the time a failure bubbles up here the car genuinely isn't answering, so
        // report offline rather than adding another retry layer on top.
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

  // Load live state on connect. Cached state (lock/doors/charge) is already painted
  // at the ~3s "connected" mark by _hydrateCachedState; this refreshes it.
  //
  // CRITICAL — the displayed lock state drives the toggle button (page renders LOCK
  // whose action is unlock, and vice versa). A STALE lock state silently misfires the
  // button (device 2026-06-15: cache said locked, car was unlocked → tapping "lock"
  // sent unlock to an already-unlocked car, nothing happened). So getting fresh VCSEC
  // status is not cosmetic — it's correctness.
  //
  // GET_STATUS is slow on this car: it answers only once the passive-entry handshake
  // progresses — device 2026-06-15 saw the first status ~21s after Established. A
  // single short attempt (the previous version) timed out long before that and left
  // the stale cache uncorrected. So we POLL with short deadlines until a status lands,
  // re-waking each round; the polls dispatch passive-entry beacons (handshake advances,
  // walk-up stays alive), and any status volunteered between polls is caught by
  // _startLivePushes. Charge runs AFTER status settles — running it during load gated
  // the handshake responder and pushed the status out even later.
  //   • GetChargeState (d3) is RELIABLE (~3s) but DECOUPLED: it runs whether status
  //     succeeded or the poll budget ran out, so charge never silently fails to load.
  _loadInitialState() {
    // ONE read, mimicking the Tesla Go SDK. The SDK gets a clean read conversation by
    // never doing passive entry; we can't drop passive entry, but we pause our beacon
    // replies for a short window (session.js _suppressBeaconsUntil) so the car gets the
    // same quiet moment to answer this single read.
    //
    // No poll loop: device 2026-06-25 proved the car will NOT serve a read while we're
    // answering passive-entry beacons, so attempts 2..N (with beacons active again) were
    // guaranteed futile — and worse, each fired a signed wake + status that queued ahead
    // of the AuthenticationResponse the car needs for walk-up unlock, congesting the one
    // link they share. So we take the single quiet-window shot; if it misses, fresh state
    // arrives via the reply-chain instead (command acks + handshake escalation feed
    // _applyStatus through the idle/push listener). Cached state shows meanwhile.
    var STATUS_READ_WINDOW_MS = 2500
    var READ_DEADLINE_MS = 3000 // ≥ window, so the read spans the whole quiet period
    var self = this
    var done = false
    teslaSession.wake(function () {}) // one prod for a dozing car (signed; fire-and-forget)
    teslaSession.getVehicleStatus(
      function (r) {
        if (r && r._requeue) return // beacon notification, not terminal — keep waiting
        if (done) return
        done = true
        if (r.success) self._applyStatus(r.status) // fresh lock/door state — fixes the toggle
        // Charge is decoupled and runs whether or not the read landed (best-effort).
        self._loadChargeState(null, 4000)
      },
      READ_DEADLINE_MS,
      STATUS_READ_WINDOW_MS,
    )
  }

  // Fetch the charge snapshot (infotainment domain) AFTER the VCSEC status work
  // settles — they share the one BLE response slot, so this must run sequentially,
  // not concurrently. Best-effort: a failure leaves the cached charge in place.
  // timeoutMs (optional): the connect-time fetch passes a SHORT deadline — a
  // deeply asleep car ignores d3 too, and the charge fetch holds the slot (gating
  // passive entry) for its whole deadline (device 2026-06-15: 6s wasted on a
  // sleeping car). A tight bound releases walk-up sooner while still covering an
  // awake car's ~3s d3 answer. Manual pull-to-refresh keeps the default 6s.
  _loadChargeState(cb, _timeoutMs) {
    // CHARGE DISABLED — VCSEC only. getChargeState opens an infotainment (domain 3)
    // session that shares the single BLE response slot with VCSEC and gates passive
    // entry; it was starving GET_STATUS and the RKE command path. No d3 session is
    // established at all for now. To re-enable, restore the getChargeState body (see
    // git history) and uncomment the Battery readout + charge button in page/index.js.
    if (cb) cb({ success: false, error: 'charge disabled (VCSEC only)' })
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

  // App-close auto-lock. Passive entry only auto-locks while the watch is connected;
  // closing the app drops BLE, so a car left unlocked stays unlocked. On close, if
  // we're still connected to an UNLOCKED car with NO driver present, fire a lock
  // before the BLE link is torn down. Fire-and-forget with a synchronous flush —
  // onDestroy kills the process immediately after, so there's no time to wait for an
  // ACK or pace chunks. Returns true if a lock was sent. Gating is conservative: it
  // never locks while someone's in the car (userPresent) or if already locked.
  lockOnClose() {
    if (this.connection.status !== 'online') return false
    if (this.locked) return false        // already locked — nothing to do
    if (this.userPresent) return false   // driver in the car — do not lock them in/out
    return teslaSession.lockSyncFireAndForget()
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
