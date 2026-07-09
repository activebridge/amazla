import { push } from '@zos/router'
import { build, destroy } from './../page/main.js'

// Secondary widget: runs the SAME main-app controller as page/index.js (page/
// main.js), so the widget is the full app experience — live connect, status,
// lock/unlock/frunk/trunk — not a static snapshot. The only host difference is
// navigation: the widget PUSHES the pairing page (opening the app), where the
// page replaces.
SecondaryWidget({
  build() {
    build({ navigate: (url) => push({ url }) })
  },
  onDestroy() {
    destroy()
  },
})
