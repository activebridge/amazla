import { openActionDialog } from '../libs/editDialog.js'
import { openSettingsDialog } from '../libs/settingsDialog.js'
import { ADD_BUTTON, HEADER_ROW, ICON_BUTTON } from '../styles.js'
import { Help } from './help.js'
import { Search } from './search.js'

export const Header = (store, count) => {
  return View({ style: HEADER_ROW }, [
    Search(count),

    Button({
      label: '+',
      style: ADD_BUTTON,
      onClick: (e) => {
        openActionDialog(e, null)
      },
    }),

    Button({
      label: '⚙️',
      style: ICON_BUTTON,
      onClick: (e) => {
        openSettingsDialog(e)
      },
    }),

    Help(store),
  ])
}
