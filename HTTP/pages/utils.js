import vibro from './../../zeppify/vibrate.js'
import { readFileSync, writeFileSync } from './../shared/fs'

// v1 build: no @zos anywhere, so no getPackageInfo — the id is the one in app.json.
// The widgets need it to launch the page through hmApp.startApp.
export const APP_ID = 1035725

const FILE_NAME = 'fs_settings.txt'

const DEFAULTS = {
  actions: [],
  config: {
    buttons: 4,
    awake: false,
  },
}

// v1 showToast takes `text`, newer runtimes take `content` — send both and let the
// runtime read the one it knows. Plain concatenation, no template literals: the v1
// QuickJS build chokes on them in some contexts.
export const toast = (message) => hmUI.showToast({ text: '' + message, content: '' + message })

// Result feedback on the motor. Lives here so both the caller (pages/output.js) and
// the result screen can fire it — whichever context is the one that stays alive.
export const buzz = (success) => (success ? vibro.notification() : vibro.duration())

// Leave the app. v1 has no documented hmApp.exit() — the router only promises
// startApp/gotoPage/goBack — so exit() is tried first and goBack() unwinds the page
// stack when it isn't there (a goBack from the app's root page leaves the app).
// `depth` = how many pages are open: 1 from the action grid, 2 from the result
// screen sitting on top of it.
export const exitApp = (depth = 1) => {
  if (typeof hmApp === 'undefined') return
  if (hmApp.exit) return hmApp.exit()
  if (!hmApp.goBack) return
  for (let i = 0; i < depth; i++) hmApp.goBack()
}

// Cached settings blob, so the page, the widget and the card all render something
// before the phone answers. hmFS-backed: works on every runtime, unlike @zos/fs.
export const localStorage = {
  get settings() {
    try {
      // readFileSync returns undefined when the file isn't there yet — a fresh
      // install, or the first run after a rebuild wipes app storage. Feeding that to
      // JSON.parse threw "unexpected token: 'undefined'" on every open.
      const raw = readFileSync(FILE_NAME)
      if (!raw) return DEFAULTS
      return JSON.parse(raw) || DEFAULTS
    } catch (e) {
      return DEFAULTS
    }
  },

  set settings(value) {
    try {
      writeFileSync(FILE_NAME, JSON.stringify(value))
    } catch (e) {
      toast('ERROR: ' + e)
    }
  },
}
