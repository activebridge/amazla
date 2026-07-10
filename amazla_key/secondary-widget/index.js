import { push } from '@zos/router'
import { build, destroy } from './../page/main.js'

// Secondary widget: runs the SAME main-app controller as page/index.js (page/
// main.js), so the widget is the full app experience — live connect, status,
// lock/unlock/frunk/trunk — not a static snapshot. The only host difference is
// navigation: the widget PUSHES the pairing page (opening the app), where the
// page replaces.
//
// Unlike the page, the widget instance PERSISTS across visits: leaving fires
// onPause (not onDestroy) and returning fires onResume (not build). Without the
// re-entry hooks the widget kept the dropped session's "Disconnected" label and
// never reconnected. up()/down() make every visit a full session: pause =
// auto-lock + BLE teardown (destroy), resume = full rebuild + reconnect (build;
// render()'s UI.reset() clears the previous visit's widgets).

let active = false

const up = () => {
  if (active) return
  active = true
  build({ navigate: (url) => push({ url }) })
}

const down = () => {
  if (!active) return
  active = false
  destroy()
}

SecondaryWidget({
  build: up,
  onResume: up, // first entry: no-op right after build; re-entry: reconnect
  onPause: down,
  onDestroy: down,
})
