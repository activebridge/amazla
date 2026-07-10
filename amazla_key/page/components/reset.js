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
    // createModal supports title/subtitle (and textColor/textAlpha/src) beyond what
    // @zeppos/device-types' stubs list — the stubs lag the firmware API. textColor
    // (white) and textAlpha (255) are the defaults, so we only set the copy.
    const dialog = createModal({
      title: getText('reset_title'),
      content: getText('reset_subtitle'),
      subtitle: getText('reset_subtitle'),
      autoHide: true,
      onClick: (keyName) => {
        if (keyName === MODAL_CONFIRM) onReset()
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
