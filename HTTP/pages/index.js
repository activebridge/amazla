import UI, { height as h, isBar, isRound, isV1, text } from './../../pages/ui.js'
import { keyListener, keyUnlisten } from './keys.js'
import { response } from './output.js'
import { keepScreenOn } from './screen.js'
import { PER_SLIDE, Slide } from './slide.js'
import { localStorage, toast } from './utils.js'

let isBusy = false
let widgets = []
let currentFocus = -1
let app = null
let rendered = false
let renderTimer = null

// Read lazily — globalData.messageBuilder is set in app.onCreate, and a
// module-eval snapshot would capture the initial null.
const getMessageBuilder = () => getApp()._options.globalData.messageBuilder

// Bar screens stack their actions and only have room for three, whatever the setting
// says — the fourth would fall off the bottom.
const perSlide = (buttons) => Math.min(buttons, PER_SLIDE)

const focus = (i) => {
  if (widgets.length === 0) return
  currentFocus += i
  if (currentFocus >= widgets.length) currentFocus = 0
  if (currentFocus < 0) currentFocus = widgets.length - 1
  const {
    settings: {
      config: { buttons = 4 },
    },
  } = app.state

  // Never animate: the slide swap should feel like the wrap-to-first jump does.
  hmUI.scrollToPage(Math.floor(currentFocus / perSlide(buttons)), false)

  widgets.map((widget) => widget.setProperty(hmUI.prop.VISIBLE, false))
  widgets[currentFocus].setProperty(hmUI.prop.VISIBLE, true)
}

Page({
  state: { settings: localStorage.settings },

  render() {
    const { actions = [], config: { buttons = 4, awake } = {} } = app.state.settings
    let index = 0
    widgets = []
    currentFocus = -1

    // A re-render (sync answered with different settings) deletes the widgets the
    // scroll view is paging through, so it is turned off before they go.
    if (rendered && typeof hmUI.setScrollView === 'function') hmUI.setScrollView(false, h, 1, false)
    UI.reset()

    if (actions.length === 0) {
      text({
        text: 'No actions configured.\nPlease set up actions in the settings',
      })
      return
    }
    const size = perSlide(buttons)
    for (let i = 0; i < actions.length; i += size) {
      const chunk = actions.slice(i, i + size)
      const slide = Slide(app, chunk, i, index)
      widgets = widgets.concat(slide)
      index += 1
    }
    hmUI.setScrollView(true, h, index, true)
    rendered = true
    // API-1.0 square watches keep their status bar — hiding it there leaves a dead
    // strip instead of screen (the same call authenticator guards this way). Bar
    // screens are the exception: Band 7 gives the strip back as usable screen.
    const keepBar = isV1 && !isRound && !isBar
    if (!keepBar && typeof hmUI.setStatusBarVisible === 'function') hmUI.setStatusBarVisible(false)

    if (awake) keepScreenOn(true)
    keyListener(focus, app.execFocus)
  },

  fetch(id) {
    if (isBusy) return toast('Busy...')
    isBusy = true
    const action = app.state.settings.actions.find((a) => a.id === String(id))
    toast('Running ' + (action ? action.title : id))
    getMessageBuilder()
      .request({ method: 'FETCH', params: { id } })
      .then(({ result }) => {
        response(result, app.state.settings)
      })
      .catch((error) => {
        toast('ERROR: ' + error)
      })
      .finally(() => {
        isBusy = false
      })
  },

  // Runs the focused action, or — from a physical key press — the one assigned to
  // that button in the settings. Returns whether anything was fired, so keys.js can
  // hand an unhandled press back to the OS.
  execFocus(isShortcut = false) {
    const {
      state: {
        settings: { actions = [], config: { press } = {} },
      },
    } = app
    const action = !isShortcut
      ? actions[currentFocus] || actions[0]
      : actions.find((a) => a.id === String(press))
    if (!action) {
      if (!isShortcut) toast('No action assigned')
      return false
    }
    app.fetch(action.id)
    return true
  },

  build() {
    app.render()
    app.sync()
  },

  sync() {
    getMessageBuilder()
      .request({ method: 'SETTINGS' })
      .then(({ result }) => {
        if (!result) return
        if (JSON.stringify(app.state.settings) === JSON.stringify(result)) return

        app.state.settings = result
        localStorage.settings = result
        // The polyfill turns this into timer.createTimer(300, …); v1 documents a
        // 1000 ms floor, so watch that the re-render still lands on API-1.0.
        renderTimer = setTimeout(app.render, 300)
      })
      .catch((error) => toast('ERROR: ' + error))
  },

  onInit(id) {
    app = this
    if (id) app.fetch(id)
  },

  onDestroy() {
    const { config: { awake } = {} } = app.state.settings || {}
    // A pending re-render must not outlive the page it would draw into.
    if (renderTimer) clearTimeout(renderTimer)
    renderTimer = null
    if (awake) keepScreenOn(false)
    keyUnlisten()
    UI.reset()
  },
})
