import { localStorage } from './home/utils.js'
import { Slide } from "./home/slide.js"
import { BasePage } from '@zeppos/zml/base-page'
import { showToast } from '@zos/interaction'
import { response } from './home/response.js'

let isBusy = false

SecondaryWidget(
  BasePage({
    state: { settings: localStorage.settings || {} },

    fetch(id) {
      if (isBusy) return showToast({ content: 'Busy...' })
      isBusy = true
      const action = this.state.settings.actions.find(a => a.id === String(id))
      showToast({ content:  `Running ${action.title}` })
      this.request({ method: 'FETCH', params: { id } }).then(({ result }) => {
        response(result, this.state.settings, true)
      }).catch(error => { showToast({ content: `ERROR: ${error}` })
      }).finally(() => { isBusy = false })
    },

    build() {
      const { settings: { actions, config: { buttons = 4 } } } = this.state
      const firstFourActions = actions.slice(0, buttons)

      const slide = Slide(this, firstFourActions, 0, 0)
    },
  })
)
