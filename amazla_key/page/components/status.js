import draw from 'zosLoader:./status.[pf].layout.js'
import { getText } from '@zos/i18n'

// General connection-status component. Owns the state→label→color mapping and the
// { update } factory; the shape-specific renderer is imported via the `[pf]`
// zosLoader (build-time selected — status.r.layout.js on round, status.s.layout.js
// on square) and supplies ONLY a draw({ text, color }) function. Round draws a
// curved bezel arc; square draws a bottom-edge line. This file is the single
// source of truth for what a connection state means — the renderers never
// duplicate it. The page imports THIS (not the [pf] file directly):
//
//   import Status from './components/status.js'
//   const status = Status('checking')   // creates + paints the initial state
//   status.update('online')             // repaints

// Semantic connection states → color. The label is localized via getText under
// the `status_<key>` msgid (see page/i18n). An unknown key falls back to its raw
// string in grey, so update('Pairing…') still shows something sane.
const COLORS = {
  checking: 0xffcc66,
  online: 0x00ef33,
  offline: 0xff6666,
  failed: 0xff6666,
  unlicensed: 0xff9900,
}

const labelFor = (key) => {
  const color = COLORS[key]
  return color === undefined ? { text: String(key), color: 0xcccccc } : { text: getText(`status_${key}`), color }
}

export default function Status(initial) {
  const update = (key) => draw(labelFor(key))
  update(initial)
  return { update }
}
