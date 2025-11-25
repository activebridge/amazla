import { BasePage } from '@zeppos/zml/base-page'
import { showToast } from '@zos/interaction'
import { text } from './../../../pages/ui.js'
import { response } from './home/response.js'
import { Slide } from './home/slide.js'
import { localStorage } from './home/utils.js'

let isBusy = false

SecondaryWidget(
  BasePage({
    state: { settings: localStorage.settings || { actions: [], config: {} } },

    onInit() {
      this.state.settings = localStorage.settings || {
        actions: [],
        config: {},
      }
    },

    fetch(id) {
      if (isBusy) return showToast({ content: 'Busy...' })
      isBusy = true
      const action = this.state.settings.actions.find(
        (a) => a.id === String(id),
      )
      showToast({ content: `Running ${action.title}` })
      this.request({ method: 'FETCH', params: { id } })
        .then(({ result }) => {
          response(result, this.state.settings, true)
        })
        .catch((error) => {
          showToast({ content: `ERROR: ${error}` })
        })
        .finally(() => {
          isBusy = false
        })
    },

    build() {
      const {
        settings: {
          actions,
          config: { buttons = 4 },
        },
      } = this.state
      const firstFourActions = actions.slice(0, buttons)

      if (actions.length === 0) {
        text({
          text: 'No actions configured.\nPlease set up actions in the settings',
        })
        return
      }
      Slide(this, firstFourActions, 0, 0)
    },
  }),
)
