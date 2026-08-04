import UI, { button, height, img, isRound, isV1, text, width as w } from './../../pages/ui.js'
import { buzz, exitApp, localStorage } from './utils.js'

// Full-screen result: outcome mark on top, status + body in the middle, a pill
// button at the bottom — the layout amazla_key uses for its status screens. This is
// what the 'notification' output mode renders; the watch has no notification API a
// v1-compatible build can reach, and a result that stays put until dismissed is what
// that mode was chosen for.

// Type scales with the screen width (like slide.js), vertical positions with its
// height — on a tall narrow band the two are far apart. Straight proportion goes
// unreadable at the bottom end though (194 px wide ⇒ a 26 px body becomes 10), so
// text takes a floor: `at(n, min)`.
const s = (n) => ((n * w) / 480) | 0
const v = (n) => ((n * height) / 480) | 0
const at = (n, min) => Math.max(s(n), min)

const OK = 0x00ca4e
const FAIL = 0xd71920

let result = null

Page({
  onInit(param) {
    try {
      result = JSON.parse(param)
    } catch (e) {
      result = { body: String(param || ''), status: '', success: false }
    }
  },

  build() {
    if (!(isV1 && !isRound) && hmUI.setStatusBarVisible) hmUI.setStatusBarVisible(false)

    // registerKeyEvent is global, so the action grid's handler is still live under
    // this page — take it over, or UP/DOWN would move focus and SELECT would fire a
    // second request behind the result. BACK falls through to the OS (= go back);
    // the grid re-registers its own handler when it rebuilds on return.
    if (typeof hmApp !== 'undefined' && hmApp.registerKeyEvent) {
      hmApp.registerKeyEvent((key) => {
        return !(hmApp.key && key === hmApp.key.BACK)
      })
    }

    const success = !!result.success
    const color = success ? OK : FAIL

    // Vibration and Exit on Success belong to this page, not to pages/output.js: the
    // grid that fired the request is destroyed on the way in, which kills a timer it
    // started and takes its VIBRATE sensor with it. Two pages are open (grid + this
    // one), so the exit's fallback unwind pops both.
    const { config: { exit: close, vibrate } = {} } = localStorage.settings
    if (vibrate) buzz(success)
    if (close && success) setTimeout(() => exitApp(2), 2000)

    // Outcome mark as an image, not a glyph: the system font has no '✕' (it renders
    // as an empty box, seen on device) and no ✅/❌ emoji either. The PNGs are palette
    // + tRNS with the colour baked in — IMG auto_scale (the pages/ui.js default)
    // resizes the 120 px source to whatever the screen gives us.
    const mark = at(120, 60)
    img({
      src: success ? 'check.png' : 'cross.png',
      y: v(-150),
      w: mark,
      h: mark,
    })

    text({
      y: v(-60),
      w,
      h: at(50, 28),
      text: '' + (result.status || ''),
      text_size: at(44, 24),
      color,
    })

    text({
      y: v(20),
      w: w - s(80),
      // Tall enough for the 200-char cap xhr.js puts on the body; the OK pill
      // starts at v(170) - h/2, so this stays clear of it.
      h: v(160),
      text: '' + (result.body || ''),
      text_size: at(26, 16),
      color: 0xc0c0c0,
      text_style: 'wrap',
    })

    const btnW = Math.min(at(200, 120), w - s(40))
    button({
      y: v(170),
      w: btnW,
      h: at(64, 40),
      radius: at(32, 20),
      text: 'OK',
      text_size: at(28, 18),
      color: 0xffffff,
      normal_color: 0x333333,
      press_color: 0x111111,
      click_func: () => {
        if (typeof hmApp !== 'undefined' && hmApp.goBack) hmApp.goBack()
      },
    })
  },

  onDestroy() {
    if (typeof hmApp !== 'undefined' && hmApp.unregisterKeyEvent) hmApp.unregisterKeyEvent()
    UI.reset()
  },
})
