import { getText } from '@zos/i18n'
import { height, text, width } from './../../../pages/ui.js'

// Square-screen connection status: PLACEHOLDER. The bezel arc doesn't fit the
// corners, so this is just a plain bottom-aligned text line for now. Painted
// through pages/ui.js text() (tracked by UI.reset(), like the round build). Same
// factory surface, loaded via `[pf]`:
//
//   const status = Status('checking')
//   status.update('online')

const TEXT_SIZE = 22

// Connection state → color; label localized via getText (`status_<key>`).
const COLORS = {
  checking: 0xffcc66,
  online: 0x00ef33,
  offline: 0xff6666,
  failed: 0xff6666,
}

const labelFor = (key) => {
  const color = COLORS[key]
  return color === undefined ? { text: String(key), color: 0xcccccc } : { text: getText(`status_${key}`), color }
}

export default function Status(initial) {
  const update = (key) => {
    const s = labelFor(key)
    text({
      x: 0,
      y: height - 38,
      w: width,
      h: 30,
      text: s.text,
      text_size: TEXT_SIZE,
      color: s.color,
    })
  }

  update(initial)
  return { update }
}
