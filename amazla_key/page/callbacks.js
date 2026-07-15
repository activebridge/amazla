import tesla from '../lib/tesla.js'
import store from '../lib/store.js'

// Auto-lock / auto-unlock convenience actions, driven by the opt-in settings toggles
// (store.autoUnlock / store.autoLock, both default OFF). These are PAGE-level policy —
// tesla is only the key/transport facade — so the decision (which toggle, which gates)
// lives here and is shared by every host (main page, secondary widget, app widget).

// Auto-unlock on connect. Call when the connection first reaches 'online'. Reads the
// PERSISTED store.autoUnlock (synced from the phone on connect, or a prior session); if
// on and the car is locked, send an unlock. It's fine to miss the very first connect
// after a toggle change — the sync updates storage for the next connect.
export function autoUnlock() {
  console.log('[callbacks] autoUnlock: store.autoUnlock=' + store.autoUnlock + ' locked=' + tesla.locked)
  if (store.autoUnlock && tesla.locked) tesla.unlock()
}

// Auto-lock on app close. Call BEFORE tesla.shutdown(), while the BLE link is still up.
// Passive entry only auto-locks while the watch is connected, so closing the app would
// leave an unlocked car unlocked. Gating is conservative: never lock while someone is in
// the car (userPresent) or if it's already locked. The send is fire-and-forget with a
// synchronous flush (tesla.lockSync) since onDestroy tears the process down right after.
// Returns true if a lock was sent. Every gate logs so a "didn't lock" report is
// diagnosable (this runs once at close and used to fail silently).
export function autoLock() {
  if (!store.autoLock) { console.log('[callbacks] autoLock skip: autoLock OFF'); return false }
  if (tesla.connection.status !== 'online') { console.log('[callbacks] autoLock skip: not online (' + tesla.connection.status + ')'); return false }
  if (tesla.locked) { console.log('[callbacks] autoLock skip: already locked'); return false }
  if (tesla.userPresent) { console.log('[callbacks] autoLock skip: user present'); return false }
  return tesla.lockSync()
}
