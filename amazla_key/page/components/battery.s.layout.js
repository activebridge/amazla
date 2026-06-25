import { getText } from '@zos/i18n'
import { level_color } from './../../../pages/styles.js'
import { button, text } from './../../../pages/ui.js'

// Square-screen battery: the edge arc doesn't fit the corners, so this is just a
// plain text placeholder. Loaded via the `[pf]` zosLoader — the round build gets
// battery.r.layout.js (the full arc) instead, so there's no shape check here.

// A snapshot older than an hour is greyed so a cached "Charging" can't mislead.
const CHARGE_STALE_SEC = 3600

export const Battery = (slide, charge, primaryState, onRefresh) => {
  if (!charge || typeof charge.level !== 'number') return
  const stale = Math.floor(Date.now() / 1000) - (charge.ts || 0) > CHARGE_STALE_SEC
  let color = 0x888888
  if (!stale) color = charge.state === 'Charging' ? 0x00ef33 : level_color(charge.level)

  // No arc to follow on square — range (miles) and primary state sit inline with
  // the %, e.g. "72% · 210 mi · Charging". All words via getText.
  let label = `${charge.level}%`
  if (typeof charge.range === 'number') label += ` · ${Math.round(charge.range)} ${getText('charge_unit_mi')}`
  if (primaryState) label += ` · ${getText(`charge_${primaryState}`)}`
  // Transparent tap target FIRST so the text draws on top and stays legible.
  button(
    {
      centered: true,
      x: 0,
      y: -211,
      w: 320,
      h: 30,
      text: '',
      normal_color: 0x000000,
      press_color: 0x111111,
      alpha: 0,
      radius: 0,
      click_func: onRefresh,
    },
    slide,
  )
  text({ centered: true, x: 0, y: -211, w: 320, h: 30, text: label, text_size: 22, color }, slide)
}
