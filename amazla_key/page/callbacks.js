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

// Auto-unlock on connect. Call when the connection first reaches 'online'. Reads the
// PERSISTED store.autoUnlock (synced from the phone on connect, or a prior session); if
// on and the car is locked, send an unlock. It's fine to miss the very first connect
// after a toggle change — the sync updates storage for the next connect.
export function autoUnlock() {
  console.log('[callbacks] autoUnlock: store.autoUnlock=' + store.autoUnlock + ' locked=' + tesla.locked)
  if (store.autoUnlock && tesla.locked) tesla.unlock()
}
