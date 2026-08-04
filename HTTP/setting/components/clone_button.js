import { resetCardScrollPositions } from '../libs/dom.js'
import { CLONE_BUTTON } from '../styles.js'

export const CloneButton = (action) => {
  return Button({
    style: CLONE_BUTTON,
    label: '⧉',
    onClick: () => {
      action.clone()
      // The row that was swiped open is reused for whatever ends up in this
      // position, so it has to be swiped back shut.
      setTimeout(resetCardScrollPositions, 50)
    },
  })
}
