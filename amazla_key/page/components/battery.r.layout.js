import { getText } from '@zos/i18n'
import { level_color } from './../../../pages/styles.js'
import { height, img, progress, text } from './../../../pages/ui.js'

// Round-screen battery: the full-edge charging arc (same visual as the
// amazla/keyfob app). A dim track ring with the battery level painted over it.
// The % sits horizontally in the arc's top gap (12 o'clock, where the ring has
// no line), and the primary state (Parked/Charging/Charged/Asleep) curves along
// the ring just beneath it — drawn per-glyph since the TEXT widget can't rotate.
// Loaded via the `[pf]` zosLoader — the square build gets battery.s.layout.js
// instead, so there's no shape check here.

// A snapshot older than an hour is greyed so a cached "Charging" can't mislead.
const CHARGE_STALE_SEC = 3600

// Arc sweep (ZeppOS angles: 0° at 12 o'clock, clockwise). The ~10° gap at the
// very top (355°→5°) is where the % readout goes.
const START = 5
const END = 355

// Curved text via the TEXT widget's own start_angle/end_angle/radius (it lays the
// string along an arc — no manual per-glyph placement). Pass an explicit `radius`
// (the default full-screen box gives center_x/center_y = screen center). The TEXT
// widget shares the ARC_PROGRESS angle convention (0° = 12 o'clock, clockwise), so
// `arcDeg` is used directly — NO +90 offset. (The authenticator secondary widget
// adds +90 only because it aligns text to a widget.ARC, whose 0° is at 3 o'clock.)
// `mode: 1` flips glyphs upright on the bottom half. Span is sized to the string.
// `align` controls how the string sits relative to `arcDeg`: 'center' (default),
// 'start' (left edge anchored at arcDeg, grows clockwise) or 'end' (right edge
// anchored at arcDeg, grows counter-clockwise). Anchoring keeps two unequal-length
// strings symmetric about a shared point regardless of their widths.
const curvedText = (slide, str, arcDeg, radius, textSize, color, mode, align) => {
  const span = str.length * ((textSize * 0.62) / radius) * (180 / Math.PI)
  let start = arcDeg - span / 2
  if (align === 'start') start = arcDeg
  else if (align === 'end') start = arcDeg - span
  text(
    {
      text: str,
      text_size: textSize,
      color,
      radius,
      mode: mode || 0,
      start_angle: Math.round(start),
      end_angle: Math.round(start + span),
    },
    slide,
  )
}

export const Battery = (slide, charge, primaryState, _onRefresh) => {
  if (!charge || typeof charge.level !== 'number') return
  const stale = Math.floor(Date.now() / 1000) - (charge.ts || 0) > CHARGE_STALE_SEC
  let color = 0x888888
  if (!stale) color = charge.state === 'Charging' ? 0x00ef33 : level_color(charge.level)

  // Edge ring: dim track first, then the level arc on top (both span the same
  // sweep; the widget fills `level`% of start→end).
  const radius = height / 2 - 5
  progress(
    { x: 0, y: 0, radius, line_width: 10, start_angle: START, end_angle: END, color: 0x333333, level: 100 },
    slide,
  )
  progress(
    { x: 0, y: 0, radius, line_width: 10, start_angle: START, end_angle: END, color, level: charge.level },
    slide,
  )

  // SOC-limit marker. ARC_PROGRESS has no native marker (Zepp docs), so use a
  // rotated image — the watch-hand technique: a full-canvas marker.png with the
  // triangle drawn at the top (on the ring); the img() helper centers it, so it
  // pivots on the screen center, and `angle` (0° = 12 o'clock, same as the ring)
  // swings it to the limit position along the same sweep the level fills.
  if (typeof charge.limit === 'number') {
    const lim = Math.max(0, Math.min(100, charge.limit))
    img({ src: 'marker.png', angle: START + (lim / 100) * (END - START) }, slide)
  }

  const charging = charge.state === 'Charging'

  // Charging icon: a standalone bolt at 12 o'clock (top of the arc gap), separate
  // from the % below it. ZeppOS QuickJS has no emoji font / no bolt asset, so the
  // `ϟ` glyph stands in for ⚡. Shown only while charging.
  // h smaller than the glyph + CENTER_V clips the bolt's top & bottom so it reads
  // as a compact icon (text_size unchanged). Nudged up 10px.
  if (charging) text({ centered: true, x: 0, y: -(radius - 4), w: 40, h: 18, text: 'ϟ', text_size: 28, color }, slide)

  // battery_range is decoded in miles.
  const range = typeof charge.range === 'number' ? `${Math.round(charge.range)} ${getText('charge_unit_mi')}` : null

  // % and miles flank the bolt at 12, each anchored the same gap (±8°) from the
  // top and fanning outward — so they stay symmetric even though "210 mi" is wider
  // than "2%". Identical props otherwise (same size/radius/mode).
  curvedText(slide, `${charge.level}%`, -8, radius - 8, 26, color, 0, 'end')
  if (range != null) curvedText(slide, range, 8, radius - 8, 26, color, 0, 'start')

  // Bottom (6 o'clock = arc 180°, mode 1 = upright): while charging show the ETA
  // ("Charging: 1h 15m left"); otherwise just the state. All words via getText.
  const bottom =
    charging && charge.minsToFull > 0
      ? `${getText('charge_charging')}: ${fmtMins(charge.minsToFull)} ${getText('charge_left')}`
      : getText(`charge_${primaryState}`)
  if (bottom) curvedText(slide, bottom, 180, radius - 8, 26, color, 1)
}

// minutes → "2h 15m" / "45m" (h/m units localized)
const fmtMins = (m) => {
  const h = Math.floor(m / 60)
  const mm = m % 60
  const hu = getText('charge_unit_h')
  const mu = getText('charge_unit_m')
  return h > 0 ? `${h}${hu} ${mm}${mu}` : `${mm}${mu}`
}
