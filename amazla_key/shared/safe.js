// safe(label, fn) — run fn, swallowing any throw so best-effort cleanup can't
// abort the caller (BLE/session resets, widget teardown, native quirks). Unlike
// a bare `try {} catch (_e) {}`, it logs the failure so swallowed errors are
// still visible in the device console. Returns fn's value, or undefined on throw.
export const safe = (label, fn) => {
  try {
    return fn()
  } catch (e) {
    console.log('[safe] ' + label + ' failed: ' + ((e && e.message) || e))
  }
}
