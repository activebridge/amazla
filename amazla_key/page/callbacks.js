import tesla from '../lib/tesla.js'
import store from '../lib/store.js'

// Auto-unlock convenience action, driven by the opt-in settings toggle
// (store.autoUnlock, default OFF). This is PAGE-level policy — tesla is only the
// key/transport facade — so the decision lives here, shared by every host.
//
// App-close AUTO-LOCK was removed 2026-07-16: VCSEC has no reliable "occupant in
// car" signal (userPresence = key detected, always true while connected), so a
// close-while-seated wrongly locked the car. Tesla's own walk-away lock (real seat/
// proximity sensors) handles locking; we don't.

// Auto-unlock as the connect pre-load step (registered via tesla.beforeInitialLoad in
// page/main.js). Runs on the VIRGIN connection — before the read-first status fetch and
// before passive entry answers anything — because that is the condition where commands
// are device-proven to land (lock/unlock confirmed 2026-06-02 pre-passive-entry; the Go
// SDK never answers beacons at all). Firing later got the RKE silently swallowed and
// its retries poisoned manual taps too: at raw connect alongside the read (device
// 2026-07-16) and on the first 'status' passive event (device 2026-07-17).
//
// Reads the PERSISTED store.autoUnlock (synced from the phone, or a prior session).
// Fires REGARDLESS of the known lock state (user decision 2026-07-17: "auto unlock
// should land no matter state") — the state here is a cache/stale snapshot, and
// unlocking an already-unlocked car is a harmless ack. done() MUST always be called:
// the status fetch and walk-up authorization wait on it.
// ONE attempt per connection, strictly first — no zone-entry retries, no deferred
// re-fires (all removed 2026-07-17: layered retries stacked 4 unlocks in 10s, which
// itself arms the car's RKE rate limit). The unlock's own fresh-counter retry
// (retriesOnTimeout:1) is the only repeat.
export function autoUnlock(done) {
  console.log('[callbacks] autoUnlock: store.autoUnlock=' + store.autoUnlock + ' locked=' + tesla.locked)
  if (store.autoUnlock) tesla.unlock(() => done())
  else done()
}

// ─── Auto-exit on walk-away lock ────────────────────────────────────────────
// When the user walks away with the app open, Tesla's own walk-away lock engages
// and the car pushes locked=true over the still-alive link. The open app is then
// just burning battery and holding the BLE radio — close it. Only a CAR-initiated
// lock exits: a lock the user taps on the watch keeps the app open (they want to
// see the icon flip), which is what the selfLock flag marks. Always on (no toggle
// — user decision 2026-07-17).
let sawUnlocked = false
let selfLock = false

// main.js calls this just before a user-initiated lock…
export function noteSelfLock() {
  selfLock = true
}
// …and this when that lock FAILS (refused/timed out — no locked flip is coming,
// so the mark must not eat the next real walk-away exit).
export function clearSelfLock() {
  selfLock = false
}

// Called from the page's onChange listener on every state notify. Exit fires only
// for: online, unlocked seen earlier THIS connection, now locked, not our own tap.
// Opening the app on an already-locked car never exits (no unlocked→locked
// transition was seen); leaving 'online' resets the tracking so a reconnect can't
// exit off stale state.
export function autoExitOnLock(exitFn) {
  if (tesla.connection.status !== 'online') {
    sawUnlocked = false
    selfLock = false
    return
  }
  if (!tesla.locked) {
    sawUnlocked = true
    return
  }
  if (!sawUnlocked) return
  sawUnlocked = false
  if (selfLock) {
    selfLock = false // manual tap — stay open
    return
  }
  console.log('[callbacks] car locked itself (walk-away) — exiting app')
  exitFn()
}
