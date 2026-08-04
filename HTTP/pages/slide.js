import { button, height as h, img, isBar, isV1, text, width as w } from './../../pages/ui.js'

// The layouts below were drawn for a 480 px screen. One package now ships to every
// device — Band 7 is 194 px wide — so every hardcoded text size and pixel offset is
// scaled; the w/2, w/4 fractions already follow the screen.
const k = w / 480
const s = (n) => (n * k) | 0

// No GROUPs anywhere: a slide's widgets are created straight on hmUI and carry their
// own y offset, which is what the group used to provide. A GROUP froze API-1.0
// devices on exit — bisected on Band 7, then seen on GTR 3 too: a page of plain text
// widgets exits cleanly, the same widgets inside a GROUP wedge the runtime, in either
// delete order and with the art, buttons, scroll view and key handler all removed.
// amazwallet and authenticator never used them; HTTP was the only caller.

// API-1.0 IMG has no auto_scale: the 480 px art draws 1:1 and is cropped on smaller
// screens. Those widths ship their own copy under assets/common/bg<W>/. bg194 is the
// odd one out — Band 7's art is cut into stacked rows, w × h rather than w × w.
const BG_SIZES = [194, 336, 390, 454]

const bg = (src, offset = 0) => {
  const dir = isV1 && BG_SIZES.indexOf(w) !== -1 ? 'bg' + w + '/' : ''
  img({ src: dir + src, w, h: isBar ? h : w, y: offset })
}

// Band 7 fits three actions, stacked. These must stay in step with the generated art
// in assets/common/bg194/ — same gap, same taller middle row.
const BAR_GAP = 6
const BAR_MID_EXTRA = 10

const rowHeights = (n) => {
  const span = h - BAR_GAP * (n - 1)
  if (n === 3) {
    const mid = ((span / 3) | 0) + BAR_MID_EXTRA
    const side = ((span - mid) / 2) | 0
    return [side, mid, span - mid - side]
  }
  const base = (span / n) | 0
  const rows = []
  for (let i = 0; i < n; i++) rows.push(base)
  rows[n - 1] += span - base * n
  return rows
}

const Bar = (actions, offset = 0) => {
  const n = actions.length
  bg(['singleBg.png', 'doubleBg.png', 'tripleBg.png'][n - 1], offset)

  const rows = rowHeights(n)
  const props = []
  const iconProps = []
  const textProps = []
  let top = 0

  for (let i = 0; i < n; i++) {
    const rowH = rows[i]
    // Row centre, expressed the way center() wants it: an offset from screen centre.
    const y = (top + rowH / 2 - h / 2) | 0
    top += rowH + BAR_GAP
    // Tall rows would give a huge glyph on a 194 px wide screen, so the width caps it.
    const iconSize = Math.min((rowH * 0.45) | 0, (w * 0.5) | 0)
    const titleSize = Math.min((rowH * 0.18) | 0, (w * 0.13) | 0)
    // The last row's art is the dome flipped — rounded at the bottom — so its glyph
    // and title swap places to sit inside the curve.
    const flip = i === n - 1 && n > 1 ? -1 : 1

    // Title offset capped the same way the glyph is: on a full-height row 28 % would
    // drop it far below the icon instead of under it.
    const titleY = Math.min((rowH * 0.28) | 0, (w * 0.27) | 0)

    props.push({ y, w, h: rowH })
    // Two rows are the tallest split, so their glyphs sit furthest apart — pulled
    // back toward the middle of the screen.
    const pull = n === 2 ? 20 : 0
    iconProps.push({ y: y - flip * (((rowH * 0.12) | 0) - pull), w, text_size: iconSize })
    // The one-action screen is a pill with straight sides, so its title has 20 px
    // more room than a row bounded by a dome's curve.
    textProps.push({
      // Titles sit on the inner side of their row already, so moving them toward the
      // middle of the screen means further from the row centre.
      y: y + flip * (titleY + (n === 2 ? 10 : 0)),
      w: n === 1 ? w - 20 : w - 40,
      text_size: titleSize,
      color: 0xc0c0c0,
    })
  }

  return renderActions(actions, props, textProps, iconProps, 2, offset)
}

let basePage = null

// How many actions one slide can hold. Bar screens stack them and only fit three —
// every caller must clamp to this, or the layout lookup below indexes past its art.
export const PER_SLIDE = isBar ? 3 : 4

export const Slide = (p, actions = [], _index = 0, i = 0) => {
  basePage = p
  // Nothing positions a slide any more, so it carries its own y offset — one screen
  // height per slide, which is where the group used to put it.
  const offset = h * i
  const chunk = actions.slice(0, PER_SLIDE)
  if (isBar) return Bar(chunk, offset)
  return layout[chunk.length - 1](chunk, offset)
}

const onClick = (i) => {
  basePage.fetch(i)
}

const Single = (actions, offset) => {
  const props = [{ w, h }]

  bg('singleBg.png', offset)

  const iconProps = [{ w, h, text_size: s(160), y: s(-45) }]

  const textProps = [{ w: w - s(95), h, text_size: s(56), y: s(70), color: 0xc0c0c0 }]

  return renderActions(actions, props, textProps, iconProps, s(5), offset)
}

const Double = (actions, offset) => {
  const props = [
    { y: -w / 4 - s(14), w, h: w / 2 },
    { y: w / 4 + s(14), w, h: w / 2 },
  ]

  bg('doubleBg.png', offset)

  const textProps = [
    { y: s(-60), w: w - s(95), text_size: s(56), color: 0xc0c0c0 },
    { y: s(50), w: w - s(95), text_size: s(56), color: 0xc0c0c0 },
  ]

  const iconProps = [
    { y: s(-145), w: w / 2, text_size: s(110) },
    // 140, not further out: the button rim in doubleBg.png starts at y=446/480,
    // and a s(110) glyph plus its shadow reaches y=440 from here.
    { y: s(140), w: w / 2, text_size: s(110) },
  ]

  return renderActions(actions, props, textProps, iconProps, s(5), offset)
}

const Triple = (actions, offset) => {
  const props = [
    { x: -w / 4, y: -w / 4, w: w / 2, h: w / 2 },
    { x: w / 4, y: -w / 4, w: w / 2, h: w / 2 },
    { y: w / 4 + s(14), w, h: w / 2 },
  ]

  bg('tripleBg.png', offset)

  const iconProps = [
    { x: -w / 4 + s(20), y: -w / 4, w: w / 4, text_size: s(80) },
    { x: w / 4 - s(20), y: -w / 4, w: w / 4, text_size: s(80) },
    // Bottom cell is the same shape as the one in Double — same icon and title.
    { y: s(140), w: w / 2, text_size: s(110) },
  ]

  const textProps = [
    { x: -w / 4 + s(10), w: w / 4 + s(50), y: s(-60), text_size: s(30), color: 0xc0c0c0 },
    { x: w / 4 - s(10), w: w / 4 + s(50), y: s(-60), text_size: s(30), color: 0xc0c0c0 },
    { y: s(50), w: w - s(95), text_size: s(56), color: 0xc0c0c0 },
  ]

  return renderActions(actions, props, textProps, iconProps, s(5), offset)
}

const Quad = (actions, offset) => {
  const props = [
    { x: -w / 4, y: -w / 4, w: w / 2, h: w / 2 },
    { x: w / 4, y: -w / 4, w: w / 2, h: w / 2 },
    { x: w / 4, y: w / 4, w: w / 2, h: w / 2 },
    { x: -w / 4, y: w / 4, w: w / 2, h: w / 2 },
  ]

  bg('quadBg.png', offset)

  const textProps = [
    { x: -w / 4 + s(10), w: w / 4 + s(50), y: s(-60), text_size: s(30), color: 0xc0c0c0 },
    { x: w / 4 - s(10), w: w / 4 + s(50), y: s(-60), text_size: s(30), color: 0xc0c0c0 },
    { x: w / 4 - s(10), w: w / 4 + s(50), y: s(50), text_size: s(30), color: 0xc0c0c0 },
    { x: -w / 4 + s(10), w: w / 4 + s(50), y: s(50), text_size: s(30), color: 0xc0c0c0 },
  ]

  const iconProps = [
    { x: -w / 4 + s(20), y: -w / 4, w: w / 4, text_size: s(80) },
    { x: w / 4 - s(20), y: -w / 4, w: w / 4, text_size: s(80) },
    { x: w / 4 - s(20), y: w / 4 - s(10), w: w / 4, text_size: s(80) },
    { x: -w / 4 + s(20), y: w / 4 - s(10), w: w / 4, text_size: s(80) },
  ]

  return renderActions(actions, props, textProps, iconProps, s(4), offset)
}

const layout = [Single, Double, Triple, Quad]

// Not every runtime gives a widget setEnable — the touch target is the BUTTON below,
// so a missing one costs nothing.
const disable = (widget) => {
  if (widget && widget.setEnable) widget.setEnable(false)
  return widget
}

// Neomorphic depth: the same glyph in black, offset down-right, drawn first so the
// white one sits on top of it. TEXT has no shadow property on any runtime.
const shade = (p, d) => ({ ...p, x: (p.x || 0) + d, y: (p.y || 0) + d, color: 0x000000 })

// Shift a box down by the slide's offset — every widget of slide i sits one screen
// lower than the one before it.
const drop = (p, offset) => (offset ? { ...p, y: (p.y || 0) + offset } : p)

const renderActions = (actions, props, textProps, iconProps, shadow = 0, offset = 0) => {
  return actions.map((action, i) => {
    const box = drop(props[i], offset)
    const icon = drop(iconProps[i], offset)
    const title = drop(textProps[i], offset)

    if (shadow) {
      disable(text({ ...shade(icon, shadow), w: w / 2, text: action.icon || '✽' }))
      disable(text({ ...shade(title, shadow), text: action.title || 'Action' }))
    }
    disable(text({ ...icon, w: w / 2, text: action.icon || '✽' }))
    disable(text({ ...title, text: action.title || 'Action' }))

    // The focus highlight: the same glyph in red, hidden until the crown/keys
    // move onto this action. It is what the caller gets back.
    const hi = disable(
      text({
        ...icon,
        w: w / 2,
        text_size: icon.text_size - s(6),
        text: action.icon || '✽',
        color: 0xd71920,
      }),
    )
    hi.setProperty(hmUI.prop.VISIBLE, false)

    // Transparent hit area over the background art (buttons/btnBg.png is fully
    // transparent, buttons/_btnBg.png is the 50 % press overlay).
    button({
      ...box,
      text: '',
      src: 'btnBg',
      radius: s(10),
      click_func: () => {
        onClick(action.id)
      },
    })

    return hi
  })
}
