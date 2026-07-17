import store from './store.js'
import teslaSession from './tesla-ble/session.js'

// The flat VCSEC vehicle-state booleans, in one place so the cached-snapshot
// persist/hydrate below can't drift from the properties the UI renders. These are
// PUSH-driven: while connected, the car streams VehicleStatus so they stay live.
var VCSEC_STATE_KEYS = ['locked', 'df', 'dr', 'pf', 'pr', 'trunkOpen', 'frunkOpen', 'chargePortOpen', 'sleeping', 'userPresent']

// Read-first: fire a clean GET_STATUS on a virgin connection (no beacons answered yet) to
// get SDK-style fast status, before passive entry starts. Flip ENABLED to false to revert
// to push-only status. WINDOW is how long we stay silent waiting for the read before
// resuming walk-up. See _loadInitialState.
var READ_FIRST_ENABLED = true
var READ_FIRST_WINDOW_MS = 2500

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
    this._hydrateCachedState()

    // Connection state
    this.connection = { status: 'checking', error: null }

    // Command in-flight guard
    this.busy = false

    this._listeners = []
    this._passiveListeners = []
    this._beforeLoadCb = null // page-installed pre-load step — see beforeInitialLoad()
    // Relay passive-entry handshake milestones from the session up to the UI (toasts).
    teslaSession.onPassiveEvent((evt) => this._emitPassive(evt))
    // Unexpected link loss (session already reset itself): flip the UI offline so
    // taps get an honest "Offline" instead of silently failing into a dead link
    // (device 2026-07-13: widget stayed "Connected" for a minute after a car-side
    // drop that only a late native callback reported).
    teslaSession.onLinkDown(() => {
      console.log('[Tesla] BLE link lost — marking offline')
      this.busy = false // any in-flight command's waiter was already failed by ble cleanup
      this._setConnection({ status: 'offline', error: 'Connection lost' })
    })
  }

  // Paint the last-known state immediately on load. The car can take 10–20s to
  // volunteer its first VehicleStatus (a dozing car ignores GET_STATUS until
  // woken — device captures 2026-06-11), and until then the defaults above read
  // as "wrong state". Live pushes correct drift.
  _hydrateCachedState() {
    var cached = store.lastVehicleState
    if (!cached) return
    for (var i = 0; i < VCSEC_STATE_KEYS.length; i++) {
      var k = VCSEC_STATE_KEYS[i]
      if (typeof cached[k] === 'boolean') this[k] = cached[k]
    }
  }

  // Persist the whole state blob from the in-memory object. `this` is the single
  // source of truth the VCSEC push writer (_applyStatus) updates, so rebuilding the
  // snapshot from it needs no read-modify-write of storage.
  _persistState() {
    var snap = {}
    for (var i = 0; i < VCSEC_STATE_KEYS.length; i++) snap[VCSEC_STATE_KEYS[i]] = this[VCSEC_STATE_KEYS[i]]
    store.lastVehicleState = snap
  }

  // ── Computed getters ─────────────────────────────────────────────────

  get isPaired() {
    return store.isPaired
  }
  // Enrolled = has the watch keypair + a synced VIN (i.e. set up, even if the session
  // key isn't cached yet). The main page routes an unenrolled watch to pairing.
  get isEnrolled() {
    return store.isEnrolled
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
  // Passive-entry milestone observers (initiated / approaching / authorized). Separate
  // from onChange — these are transient events for toasts, not state the page renders.
  onPassiveEvent(fn) {
    this._passiveListeners.push(fn)
  }
  _emitPassive(evt) {
    for (var i = 0; i < this._passiveListeners.length; i++) {
      try {
        this._passiveListeners[i](evt)
      } catch (_e) {}
    }
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
    this._connectStartedAt = Date.now() // DIAG: measure time-to-first-real-status
    this._realStatusPainted = false
    this._realStatusReceived = false
    this._setConnection({ status: 'checking', error: null })
    this.refresh()
  }

  // ── Car actions ───────────────────────────────────────────────────────

  lock(cb) {
    // gate:false for the same reason as unlock below. Device 2026-07-13: gated locks
    // timed out 15s while gate:false unlocks acked in ~0.7s on the same connection —
    // the muted responder starves the presence handshake and the car ignores the RKE.
    // Commands match their ack by per-command routing address now, so the responder
    // can't steal it; the gate protected a slot that no longer exists.
    // 5s deadline (down from the 15s default — a real ack or refusal lands in ≤1s,
    // device 2026-07-13) + one full-deadline retry: after a nominalError refusal the
    // car swallows a repeated lock for ~5–15s, and the retry rides that window out.
    this._runAction((done) => teslaSession.lock(done, { gate: false, timeoutMs: 5000, retriesOnTimeout: 1 }), cb, { locked: true })
  }

  unlock(cb) {
    // gate:false — keep answering the car's AuthenticationRequest beacons WHILE the unlock
    // is in flight (the phone does both at once). Gating the responder silences the presence
    // handshake the car needs before it actuates a sleeping car, which deadlocks the unlock.
    this._runAction((done) => teslaSession.unlock(done, { gate: false, retriesOnTimeout: 1 }), cb, { locked: false })
  }

  trunk(cb) {
    this._runAction((done) => teslaSession.trunk(done), cb, { trunkOpen: true })
  }

  frunk(cb) {
    this._runAction((done) => teslaSession.frunk(done), cb, { frunkOpen: true })
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
      // Page-installed pre-load step (see beforeInitialLoad below) runs first and
      // EXCLUSIVELY — e.g. auto-unlock policy, which is the PAGE's decision, not this
      // facade's. USER-SPECIFIED ORDER (2026-07-17): "first fire unlock, after unlock
      // run everything else" — the passive responder is suppressed and nothing else
      // is sent until the step settles; the status read and walk-up authorization
      // (which flips the UI to 'Authorized') start strictly after.
      if (this._beforeLoadCb) {
        var self = this
        teslaSession.suppressPassive(true)
        this._beforeLoadCb(function () {
          teslaSession.suppressPassive(false) // _loadInitialState re-suppresses for its read
          self._loadInitialState()
        })
      } else {
        this._loadInitialState()
      }
    })
  }

  // Facade hook (mechanism only — like onLinkDown): a step the page wants run on the
  // fresh connection BEFORE everything else — the passive responder is silent and the
  // status read waits until the step's done() (see refresh above). The facade holds
  // the load order; the page holds the policy. done() MUST be called (success or
  // failure). Registered once; a re-register overwrites (page rebuilds).
  beforeInitialLoad(fn) {
    this._beforeLoadCb = fn
  }

  // Load live state on connect. Cached state (lock/doors) is already painted at the
  // ~3s "connected" mark by _hydrateCachedState; the live-push listener (armed in
  // refresh() before this) refreshes it.
  //
  // CRITICAL — the displayed lock state drives the toggle button (page renders LOCK
  // whose action is unlock, and vice versa). A STALE lock state silently misfires the
  // button (device 2026-06-15: cache said locked, car was unlocked → tapping "lock"
  // sent unlock to an already-unlocked car, nothing happened). So fresh VCSEC status is
  // not cosmetic — it's correctness.
  //
  // READ-FIRST gets fresh status in ~1s (device 2026-06-29). Device 2026-06-26 had
  // concluded the car never serves an addressed read to a passive-entry key (status only
  // via a car-paced 8–31s push) — but that only held because we were ALREADY answering
  // beacons. On a VIRGIN connection (responder suppressed, no beacon answered yet) the car
  // serves the addressed GET_STATUS, exactly like the Go SDK (which gets clean reads
  // because it never does passive entry). So we read first, then start walk-up. The live
  // push (_startLivePushes → _applyStatus) still backstops it if the read misses.
  _loadInitialState() {
    // READ-FIRST. On a VIRGIN connection — before we've answered a single passive-entry
    // beacon — fire ONE GET_STATUS and keep the responder silent until it lands. This
    // mimics the Go SDK, which gets clean ~1s reads precisely because it never does passive
    // entry: a key that isn't actively answering beacons is served the addressed read.
    // Device 2026-06-29 measured the passive-entry push at 22–40s (car-paced, unfixable via
    // the handshake), so this is the only path to fast status. If the read misses the short
    // window we drop suppression and fall back to today's behaviour — walk-up resumes and
    // status arrives via the (slow) live push. Earlier "suppression windows" were disproven,
    // but those suppressed AFTER we'd answered beacons (already a passive-entry key to the
    // car); this is read-FIRST, the SDK's exact precondition.
    if (READ_FIRST_ENABLED) {
      var self = this
      teslaSession.suppressPassive(true)
      teslaSession.getVehicleStatus(function (r) {
        teslaSession.suppressPassive(false) // resume walk-up regardless of outcome
        if (r && r.success) self._applyStatus(r.status)
      }, READ_FIRST_WINDOW_MS)
    }
  }

  retry() {
    this._setConnection({ status: 'checking', error: null })
    this.refresh()
  }

  // App-close teardown: hand off to the session's shutdown(),
  // which clears session state AND flushes the native BLE stack so the next launch
  // doesn't inherit poisoned state (a stuck mstConnect returns "failed" for ~30s
  // otherwise). tesla talks only to teslaSession — the native BLE reset lives behind it.
  shutdown() {
    // Flush the last-known car state before the app closes, so the next launch's
    // connecting screen paints the REAL car (lock/doors) instead of the constructor
    // default (locked, all closed). _applyStatus/command-success already persist on
    // change mid-session, but a session that ended without a fresh status push (or a
    // state only reflected optimistically) would otherwise leave a stale cache. The
    // in-memory state is hydrated from cache at construct, so this never writes worse
    // data than what's already there. Skip when NOT enrolled so a reset's cache wipe
    // (store.reset removes lastVehicleState, then routes here via its own path) isn't
    // undone by re-persisting stale in-memory booleans.
    if (store.isEnrolled) {
      try {
        this._persistState()
      } catch (_e) {}
    }
    teslaSession.shutdown()
  }

  // Full unpair on the watch: wipe stored enrollment + cached state (store.reset) and
  // tear down the live session + native BLE (teslaSession.shutdown). The phone-side
  // settingsStorage is cleared separately via phone.reset(). After this the watch is
  // unenrolled → the main page routes to pairing.
  reset() {
    try {
      store.reset()
    } catch (_e) {}
    teslaSession.shutdown()
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
    // DIAG: first VehicleStatus actually RECEIVED this connection (vs "painted" below,
    // which only fires when it CHANGES the display). The gap between the two tells us
    // whether status is arriving late, or arriving on time but matching the cache.
    if (!this._realStatusReceived && this._connectStartedAt) {
      this._realStatusReceived = true
      console.log('[Tesla] real status received +' + (Date.now() - this._connectStartedAt) + 'ms')
      // First real status of this connection — the car answered and we're synced.
      // Emit once (not on every live push) so the page can give a short haptic ack.
      this._emitPassive({ type: 'status' })
    }
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
      // DIAG: time from connect() to the FIRST real VehicleStatus push painting the UI.
      if (!this._realStatusPainted && this._connectStartedAt) {
        this._realStatusPainted = true
        console.log('[Tesla] real status painted +' + (Date.now() - this._connectStartedAt) + 'ms (locked=' + next.locked + ')')
      }
      // Persist the snapshot so the next app load paints it instantly
      // (see _hydrateCachedState).
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

  _runAction(fn, cb, optimistic) {
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
        // A command failing (e.g. no ack within the deadline) does NOT mean the BLE link
        // dropped — the session is still established. Don't flip the connection to
        // "offline" (that was the bogus "connection failed" on a slow/ignored command);
        // just clear busy and surface the error to the caller, which toasts it. A real
        // link loss is reported by the BLE/session layer, not by a command outcome.
        self._notify()
        if (cb) cb(result)
        return
      }

      // Command succeeded. Do NOT re-run refresh() to reload state — that re-enters
      // ensureSessionEstablished and, if the session is momentarily not established, flips
      // the UI to "Connection Failed" even though the link is fine (and the car just
      // actuated). Fresh state arrives via the live-push listener instead.
      //
      // OPTIMISTIC state update: a terminal success ack means the car actuated, but the
      // ack carries no VehicleStatus (empty field10 — device-confirmed) and a fresh push
      // may never arrive in a short session. So apply what we KNOW we did (e.g. unlock →
      // locked:false) and persist it. Without this, after an unlock the displayed lock
      // state stays stale "locked" — both in this session and (via store.lastVehicleState)
      // the next one — which misfires the toggle button. A later real push corrects drift.
      if (optimistic) {
        var dirty = false
        for (var k in optimistic) {
          if (self[k] !== optimistic[k]) {
            self[k] = optimistic[k]
            dirty = true
          }
        }
        if (dirty) self._persistState()
      }
      self._notify() // clear busy indicator + repaint optimistic state
      if (cb) cb({ success: true })
    })
  }
}

const tesla = new Tesla()
export default tesla
