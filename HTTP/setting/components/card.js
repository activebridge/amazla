import { openActionDialog } from '../libs/editDialog.js'
import {
  CLICK_AREA,
  ROW,
  ROW_CONTENT,
  ROW_ICON,
  ROW_METHOD,
  ROW_SUB,
  ROW_TITLE,
  ROW_TITLE_ROW,
  ROW_WRAPPER,
} from '../styles.js'
import { CloneButton } from './clone_button.js'
import { DeleteButton } from './delete_button.js'
import { Handler } from './handler.js'

// Just the host: a full URL never fits one line, and the path is rarely what
// tells two actions apart at a glance.
const host = (url) => {
  if (!url) return 'no URL'
  const withoutScheme = String(url).replace(/^[a-z]+:\/\//i, '')
  const slash = withoutScheme.indexOf('/')
  return slash === -1 ? withoutScheme : withoutScheme.slice(0, slash)
}

// The nesting depth is load-bearing: libs/dom.js walks handle → ROW_CONTENT →
// ROW_WRAPPER → ROW to find the row a drag handle belongs to.
export const Card = ({ action }) => {
  return View({ style: ROW }, [
    View({ style: ROW_WRAPPER }, [
      View({ style: ROW_CONTENT }, [
        Handler(),
        View({ style: ROW_ICON }, [Text({}, action.icon)]),
        View({ style: CLICK_AREA, onClick: (e) => openActionDialog(e, action.index) }, [
          View({ style: ROW_TITLE_ROW }, [
            Text({ style: ROW_TITLE }, action.title || 'Untitled'),
            Text({ style: ROW_METHOD }, action.method),
          ]),
          Text({ style: ROW_SUB }, host(action.url)),
        ]),
      ]),
      CloneButton(action),
      DeleteButton(action),
    ]),
  ])
}
