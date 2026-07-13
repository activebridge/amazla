import { getText } from '@zos/i18n'
import { MODAL_CONFIRM, createModal } from '@zos/interaction'
import { button, img } from './../../../pages/ui.js'

// Reset/unpair button + its confirm modal, extracted from page/main.js. Renders the
// app's red pill (buttons/btn-red.png background + a transparent BUTTON carrying the
// shared 'press' tap overlay and the label). A stray tap can't unpair: the wipe runs
// only after the modal is confirmed. The caller supplies onReset() — the actual
// storage/session/phone wipe + navigation — and y (a center-relative offset).
const PILL_W = 220
const PILL_H = 72

export function ResetButton({ y, onReset }) {
  const confirm = () => {
    // Match the documented @zos/interaction example EXACTLY: the only valid copy
    // field is `content` (the earlier `title`/`subtitle` keys aren't options — the
    // native modal rejected the call on-device, so the dialog never showed and
    // confirm never fired: unpair "did nothing"). autoHide:false + manual show()
    // per the official example — confirm runs onReset (which navigates away),
    // cancel hides the dialog.
    const dialog = createModal({
      content: getText('reset_subtitle'),
      autoHide: false,
      onClick: (keyName) => {
        if (keyName === MODAL_CONFIRM) onReset()
        else dialog.show(false)
      },
    })
    dialog.show(true)
  }
  img({ src: 'buttons/btn-red.png', y, w: PILL_W, h: PILL_H })
  button({
    y,
    w: PILL_W,
    h: PILL_H,
    text: getText('reset_btn'),
    text_size: 28,
    color: 0xffffff,
    src: 'press',
    radius: 0,
    click_func: confirm,
  })
}
