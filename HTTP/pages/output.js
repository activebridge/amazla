import { buzz, exitApp, toast } from './utils.js'

// The legacy dialog. hmUI.createDialog is a v1 API that is still on hmUI in the
// current runtime — it sits next to showToast / setScrollView / getAppWidgetSize
// in @zeppos/device-types 4.0 — so one call covers every device and no @zos import
// is needed. Only `title` carries copy: one string, no separate body field.
// Returns false when the runtime doesn't have it, so the caller can fall back.
const dialog = (message) => {
  if (typeof hmUI === 'undefined' || !hmUI.createDialog) return false
  try {
    let box = null
    const close = () => {
      if (box && box.show) box.show(false)
    }
    box = hmUI.createDialog({
      title: message,
      show: true,
      auto_hide: true,
      // The option is spelled `click_linster` in the runtime and `click_listener`
      // in the newer typings — set both so whichever one exists fires.
      click_linster: close,
      click_listener: close,
    })
    return !!box
  } catch (e) {
    return false
  }
}

// The full-screen result (pages/response.js). It stays up until dismissed, which is
// what the 'notification' mode was picked for — the watch has no notification API a
// v1-compatible build can reach (@zos/notification is a module import, and no
// runtime exposes a legacy global for it).
//
// gotoPage works from the secondary widget too — authenticator's secondary widget
// opens its app page the same way, device-validated — so both contexts share it.
const screen = (result) => {
  if (typeof hmApp === 'undefined' || !hmApp.gotoPage) return false
  hmApp.gotoPage({ url: 'pages/response', param: JSON.stringify(result) })
  return true
}

// `widget` = called from the secondary widget. Only the dialog is suppressed there:
// it would cover the watchface carousel with no way back to it.
export const response = (result, settings, widget = false) => {
  const config = (settings && settings.config) || {}
  const message = result.status + ' ' + result.body

  let shown = false
  if (config.output === 'alert' && !widget) shown = dialog(message)
  else if (config.output === 'notification') shown = screen(result)
  if (!shown) toast(message)

  // Anything that has to outlive the jump to the result screen belongs to that
  // page, not to this one: gotoPage tears this context down (v1 has no onResume —
  // pages are destroyed and rebuilt), which kills a pending timer and takes the
  // page's VIBRATE sensor with it. So in that mode pages/response.js owns both the
  // buzz and the exit; here we only handle the toast and dialog cases.
  const onScreen = config.output === 'notification' && shown
  if (onScreen) return

  if (config.vibrate) buzz(result.success)
  if (config.exit && result.success) setTimeout(exitApp, 2000)
}
