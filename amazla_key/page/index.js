import { replace } from '@zos/router'
import { build, destroy } from './main.js'

// Thin page host over the shared main-app controller (page/main.js). The secondary
// widget (secondary-widget/index.js) is the other host — same controller, so the
// two behave identically. The only host-specific hook is navigate(): the page
// REPLACES (no back-stack to the main page from pairing), the widget pushes.
Page({
  build() {
    build({ navigate: (url) => replace({ url }) })
  },
  onDestroy() {
    destroy()
  },
})
