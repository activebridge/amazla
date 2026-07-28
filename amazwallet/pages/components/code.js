import { encodeEAN13 } from './../../utils/ean13'
import { encodeCode39 } from './../../utils/code39'
import { encodeCode128 } from './../../utils/code128'
import { rect, text, qrcode, width, height, screenShape } from './../../../pages/ui.js'

// The scannable code, drawn into a caller-supplied box: the card's name engraved
// above it, the code itself printed inside the white panel under the bars, the
// way a real loyalty card prints it. The card page hands this the whole screen;
// the secondary widget hands it what is left between the chevrons.
//
// A QR's white is drawn by the QRCODE widget, not by us: w/h size the pattern
// and bg_x/bg_y/bg_w/bg_h size the white behind it, each defaulting to its own
// geometry when unset. Both get set here — an unset background is what used to
// hang off the panel's edges.
const MIN_BAR_WIDTH = 2 // minimum pixels per module for scanner compatibility
const QUIET_MODULES = 10 // spec: quiet zone is 10x the narrow element
// Narrowest zone worth trading for a wider module. Under EAN-13's own 7-module
// right-hand minimum by one, a deliberate call: it is what buys 4px modules on
// a 466 screen, and the quiet zone here is card colour against a white panel —
// a harder edge than the print the spec was written for.
const MIN_QUIET_MODULES = 6
const MARGIN = 10 // white kept between the panel's edge and what it holds
const MIN_QUIET = 6 // last-resort quiet zone for a code that barely fits
const MIN_BAR_LENGTH = 60 // shortest bar a scanner's line can be swept across
const EAN_MODULES = 95 // an EAN-13 symbol, guards included — the layout below assumes it
const NAME_SIZE = 36
const CODE_SIZE = 32
const RIM = 3 // how deep the panel sits in the card
// The card name's band, above the panel: the plate itself plus a gap at each end
// so the panel never crowds it.
const BAND = NAME_SIZE + 32
const ROW = CODE_SIZE + 10 // the code's row, printed inside the panel
// White kept between a QR's outermost modules and the panel's edge.
const QR_PAD = 10
// A QR's panel is rounder than a barcode's: on round glass the corners are what
// caps the square, so rounding them harder is what lets the code grow.
const QR_RADIUS = 40

const PILL = NAME_SIZE + 12 // the name plate's own height
const NAME_GAP = 10 // card showing between the name plate and the panel
// Turned, the name plate stands on the left edge instead of lying above the
// panel, so it takes a column out of the width the way BAND takes a band out of
// the height — held off the edge itself, which on a turned code is where the
// chevron's own hit strip runs.
// What a turned code keeps clear of the left and right edges. Upright the code
// runs the full width and the screen's own bezel is margin enough; turned, the
// panel is a tall slab, and one that reaches the glass reads as spilling off it.
// This is the width of the widget's side chevron band, by the same arithmetic —
// so a full-screen card page and the widget lay a turned code out identically,
// and the widget's own area passes through the clamp untouched.
const TURN_EDGE = 10 + ((Math.min(76, (height * 0.17) | 0) * 0.34) | 0) + 8
const NAME_INSET = 10
// Card showing between the standing plate and the panel. Tighter than the gap an
// upright plate keeps: stood on end the plate is a tall thin thing beside a tall
// wide one, and the same gap that reads as a seam under a lying plate reads as a
// gutter beside a standing one. Every pixel taken off it is a pixel of bar.
const COLUMN_GAP = 5
const COLUMN = PILL + COLUMN_GAP + NAME_INSET
const ROUND = screenShape === 1
const CENTER_Y = (height / 2) | 0
const GLASS = (Math.min(width, height) / 2) | 0

// Widest a box spanning top..top+h can be drawn before its corners leave a round
// screen's glass. Everything here is centred horizontally, so this is the only
// clipping that can happen — and the caller's box says nothing about it, since
// the box is square even where the screen is not.
const glassW = (top, h) => {
  if (!ROUND) return width
  const dy = Math.max(Math.abs(top - CENTER_Y), Math.abs(top + h - CENTER_Y))
  if (dy >= GLASS) return 0
  return ((Math.sqrt(GLASS * GLASS - dy * dy) | 0) * 2) - 8
}

// Panel as high as it can sit: centred on the box, but pulled up to the middle
// of the whole area whenever the name still fits above it. A panel parked low
// enough to clear a reserved band is what pushes its corners off the glass — and
// on a full-screen page it also strands the name at the very top, far from the
// code it names.
const place = (box, areaCy, h) => Math.max(areaCy, box.y + (h / 2 | 0))

// Which way the code is laid out: a screen taller than it is wide lays it along
// the tall axis, and that is the whole rule. Round glass never turns — width and
// height are equal there, so there is nothing to turn onto.
//
// A turned code is set differently as well as laid differently: its printed
// digits stand in a column beside the bars rather than a row under them, so the
// whole height goes to the modules.
const turns = () => height > width

// How tall a wrapped line stands as a multiple of its font size. Measured twice
// off a device: a 33.5px step at 23px with 6px of line_space read as ~1.2, but a
// 13-digit run set to that still hung 3px off each end of its column, which puts
// the real height at ~1.29. Set over both — over-estimating costs a column that
// ends a few pixels short, under-estimating costs characters off both ends, and
// only one of those is visible to a scanner's owner.
const LINE = 1.35

// One character per line, spelled out. Letting CHAR_WRAP find the breaks needs a
// box exactly one glyph wide, and in a proportional font no such width exists:
// wide enough for 'C' is wide enough for 'r' and 't' together. A newline between
// every character breaks where we say, whatever the glyphs measure.
const down = (t) => {
  let out = ''
  for (let i = 0; i < t.length; i++) out += (i ? '\n' : '') + t.charAt(i)
  return out
}

// A run of text set down a column. The TEXT widget has no angle of its own —
// arc text turns glyphs, but only along a circle, and a radius big enough to
// read as straight did not draw on device — so the letters stay upright and the
// run goes vertical one line at a time. `line_space` is what spreads those lines
// over the height the column was given.
const stack = (t, box, cap, color) => {
  if (!t) return
  const cell = Math.max(1, (box.h / t.length) | 0)
  // A wrapped line stands taller than its font size, and `line_space` is added
  // ON TOP of that height, not inside it. Measured off a device screenshot: 23px
  // digits stepped 33.5px with 6px of line_space, so a line is ~1.2 sizes tall.
  // Sized against the size alone the run overshoots its column by a fifth, which
  // is a digit and a half off each end of a 13-digit code.
  // The column holds whichever glyph is widest, so the size is capped by what
  // fits across it as well as by what fits down it.
  const size = Math.min(cap, (cell / LINE) | 0, (box.w / GLYPH) | 0)
  const line = Math.ceil(size * LINE)
  const space = Math.max(0, cell - line)
  // What the rounding leaves over, split top and bottom, so the run sits centred
  // on the bars it belongs to rather than riding the top of the column.
  const slack = Math.max(0, box.h - t.length * (line + space))
  const y = box.y + ((slack / 2) | 0)
  text({
    centered: false,
    x: box.x, y, w: box.w, h: box.h - (y - box.y),
    text: down(t), text_size: size, color,
    line_space: space,
  })
}

// Which way a card is laid out, for a caller that has to reserve its own
// furniture before handing the area over: the widget's chevrons follow the card
// round, and the band they take comes off the width. A QR's own symbol is square
// and cannot turn, but the page it sits on does — the chevrons move to the sides
// with every other card's, so walking the wallet never moves the arrows around.
export const turnsCard = () => turns()

// Old cards carry a `qr` boolean and no type at all.
export const typeOf = (card) => {
  if (card.qr === true && !card.type) return 'qr'
  return card.type || 'ean13'
}

// What actually gets encoded — and so what has to be printed under the bars.
// Zero-padding to 13 is how a shorter GTIN (EAN-8, UPC-A) becomes an EAN-13:
// the check digit stays valid because the 1/3 weights keep their positions.
const digits = (type, code) =>
  type === 'ean13' ? String(code).padStart(13, '0') : String(code)

const encode = (type, code) => {
  const padded = digits(type, code)
  if (type === 'code39') return encodeCode39(padded)
  if (type === 'code128') return encodeCode128(padded)
  return encodeEAN13(padded) // ean13 + fallback for anything unknown
}

const message = (t, area) =>
  text({
    centered: false, x: area.x, y: area.y, w: area.w, h: area.h,
    text: t, text_size: 28, color: 0xffffff,
  })

// The white panel the code sits on, pressed into the card: a dark edge peeking
// out above it and a light one below. Same trick as the list card's engraved dot
// (light circle under a black one) — the cards' emboss, inverted.
const panel = (box, radius = 20) => {
  const base = { centered: false, x: box.x, w: box.w, h: box.h, radius }
  rect({ ...base, y: box.y - RIM, color: 0x000000 })
  rect({ ...base, y: box.y + RIM, color: 0xcecece })
  rect({ ...base, y: box.y, color: 0xffffff })
}

// Card name on the app widget's inset plate — a light edge peeking out from
// under a black pill, white text on top — sized to the panel below it so the two
// share an edge.
const name = (card, area, panelW, panelY) => {
  const h = PILL
  const y = Math.max(area.y, panelY - NAME_GAP - h)
  const w = Math.min(panelW, glassW(y, h))
  const x = area.x + ((area.w - w) / 2 | 0)
  const radius = (h / 2.5) | 0
  const base = { centered: false, x, y: y + 2, w }
  rect({ ...base, h: h - 2, radius, color: 0xcecece })
  rect({ ...base, h: h - 4, radius: Math.max(0, radius - 2), color: 0x000000 })
  text({
    centered: false, x: x + 12, y, w: w - 24, h,
    text: card.title || '', text_size: NAME_SIZE, char_space: 3, color: 0xffffff,
  })
}

// The same plate stood on end, against the area's left edge, the name set down
// it. Sized to the panel it stands beside, so the two share a top and a bottom
// the way the upright plate shares its width with the panel below it. The light
// edge peeks out from under the BOTTOM, exactly as it does upright: the card is
// lit from above however its furniture is turned, so an edge showing down the
// side would read as a different light altogether.
const nameColumn = (card, area, plate) => {
  const w = PILL
  const h = Math.min(plate.h, area.h)
  const y = plate.y + ((plate.h - h) / 2 | 0)
  const x = area.x + NAME_INSET
  const radius = (w / 2.5) | 0
  const base = { centered: false, x, y: y + 2, w, radius }
  rect({ ...base, h: h - 2, color: 0xcecece })
  rect({ ...base, h: h - 4, radius: Math.max(0, radius - 2), color: 0x000000 })
  stack(card.title || '', { x, y: y + 12, w, h: h - 24 }, NAME_SIZE, 0xffffff)
}

// A digit's advance as a fraction of the font size. Measured at ~0.51 off a
// screenshot (10 digits at 32px with 4px of tracking spanned 200px) — set well
// over that deliberately. The widget appears to round each advance up and to
// charge for a trailing char_space, and an estimate even a fraction low tracks
// the row past its box, at which point the whole thing slides instead of
// sitting still. Over-estimating only costs a row slightly narrower than the
// bars above it.
const GLYPH = 0.6

// Farthest a rounded rect of this size reaches from the screen's centre: its
// corner arc, not the corner itself. A rounder panel therefore fits a bigger
// square on round glass — which is the whole reason a QR's panel is rounder.
const cornerFits = (cy, side, radius) => {
  if (!ROUND) return true
  const dx = (side / 2) - radius
  const dy = Math.abs(cy - CENTER_Y) + (side / 2) - radius
  return Math.sqrt(dx * dx + dy * dy) + radius <= GLASS
}

// One run of digits, filling the width it is given: tracked out to span it, or
// set smaller when the glyphs alone would not fit.
const run = (t, x, w, y) => {
  const size = Math.min(CODE_SIZE, (w / (t.length * GLYPH)) | 0)
  // Rounded up, and the tracking shared over every glyph rather than the gaps
  // between them: the widget puts a char_space after the last one too, and an
  // advance estimated a fraction low is what tips the row into sliding.
  const glyph = Math.ceil(size * GLYPH)
  // Tracked to a hair under the box: GLYPH is measured off a screenshot, so the
  // slack is what keeps an estimate that is a fraction low from sliding the row.
  const spacing = Math.max(0, (w - 8 - t.length * glyph) / t.length | 0)
  text({
    centered: false, x, y, w, h: ROW,
    text: t, text_size: size, char_space: spacing, color: 0x000000,
  })
}

// The code printed in black on the panel under the bars. Read digit by digit off
// the screen, so it is tracked out — to exactly the width of the code above it,
// which is what makes it look printed on rather than dropped in.
const printed = (t, plate, span) => {
  // Down at the panel's bottom edge a round screen is narrower than the panel is
  // wide, so the row is kept inside whichever is tighter.
  const y = plate.y + plate.h - ROW
  // A shade wider than the code itself: sized to the bars exactly, the last
  // glyph's own bearing tips the row over its box and the text starts sliding.
  const w = Math.min(span + 20, plate.w - MARGIN * 2, glassW(y, ROW))
  run(t, plate.x + ((plate.w - w) / 2 | 0), w, y)
}

// The turned code's digits: the same printed row stood on end in the column the
// panel keeps for it, against the panel's right edge and spanning exactly the
// bars it belongs to.
const printedColumn = (t, plate, start, span) => {
  stack(t, { x: plate.x + plate.w - ROW, y: start, w: ROW, h: span }, CODE_SIZE, 0x000000)
}

const QR = (card, area, cx, areaCy) => {
  // No name plate on a QR card: the code's content is printed under it, which is
  // all such a card has to say. That leaves the whole area for the panel — the
  // biggest square it holds, taken in until its corners sit on the glass.
  let side = Math.min(area.w, area.h)
  while (side > 80 && !cornerFits(areaCy, side, QR_RADIUS)) side -= 2
  // Square less the slack under the printed code — the row is measured off the
  // panel's bottom edge, so trimming it lifts the code with it.
  const plate = { x: cx - (side / 2 | 0), y: areaCy - (side / 2 | 0), w: side, h: side - 10 }
  const size = side - QR_PAD * 2 - ROW
  // Centred in what the code's row leaves, not in the panel.
  const x = cx - (size / 2 | 0)
  const y = areaCy - (size / 2 | 0) - (ROW / 2 | 0)

  panel(plate, QR_RADIUS)
  // Shows through on a runtime without the QRCODE widget.
  text({ centered: false, ...plate, text: 'QR code \n is not supported', color: 0x000000 })
  qrcode({
    centered: false,
    content: String(card.code || ''),
    x, y, w: size, h: size,
    // The widget's white background is its own rect, and defaults to a geometry
    // of its own if left unset — which is what used to hang off the panel. Pinned
    // to the pattern exactly: the quiet zone around it is the panel's own white,
    // so this rect's square corners can never eat the panel's rounded ones.
    bg_x: x, bg_y: y, bg_w: size, bg_h: size,
  })
  printed(String(card.code || ''), plate, size)
  return true
}

// Measure a barcode against a box, or null when even 2px bars don't fit it.
// `along` is the axis the modules run along, `across` is the bar length. Which
// way round it goes is settled by `turns()` before the box is even cut, since
// the box itself differs: the name's band comes off the top upright and off the
// left turned.
const fit = (lines, box, areaCy, horizontal) => {
  if (box.w <= 0 || box.h <= 0) return null

  // The code is printed inside the panel beside the bars, never among them, so
  // it always comes off the across axis: a row under the bars upright, a column
  // to their right turned. The modules keep their axis whole either way.
  const alongMax = (horizontal ? box.w : box.h) - MARGIN * 2
  const acrossMax = (horizontal ? box.h - ROW : box.w - ROW) - MARGIN * 2

  const onGlass = (plateW, plateH) => {
    const cy = place(box, areaCy, plateH)
    return plateW <= glassW(cy - (plateH / 2 | 0), plateH)
  }

  // Module width is what makes a barcode readable, so take the widest module
  // that fits and give up everything else first: bar length, then quiet zone,
  // and only then the module itself. Whole pixels per module: a fractional width
  // gets floored per bar, which drifts and makes the quiet zones uneven. 2px is
  // a hard floor: below it a bar is not a barcode, it just looks like one.
  // Widest module worth trying is the one that fits with the NARROWEST zone the
  // search may settle for — starting from the spec zone would hide a module
  // width that only fits once the zone gives way, which is the whole trade below.
  const widest = Math.floor(alongMax / (lines.length + MIN_QUIET_MODULES * 2))
  for (let barWidth = widest; barWidth >= MIN_BAR_WIDTH; barWidth--) {
    const barcodeLength = barWidth * lines.length
    if (barcodeLength > alongMax - MIN_QUIET * 2) continue

    // Bars have to stay in proportion to the code's own width — GS1 asks 15%,
    // and a hair over that is what a wrist held at an angle needs. Without this
    // the widest quiet zone always wins and leaves a squashed strip of bars.
    const minBars = Math.max(MIN_BAR_LENGTH, (barcodeLength * 0.25) | 0)

    // Spec's quiet zone first, narrower only where the glass leaves no choice —
    // a wider module is worth more to a scanner than the last few modules of
    // white, but the white is what lets it find the code at all.
    for (let zone = QUIET_MODULES; zone >= MIN_QUIET_MODULES; zone--) {
      const room = ((alongMax - barcodeLength) / 2) | 0
      const quiet = Math.min(barWidth * zone, room)
      if (quiet < MIN_QUIET) break
      // The panel hugs the code rather than stretching past it: white beyond the
      // quiet zone buys no scan, and on round glass every pixel of panel width
      // costs panel height — which is bar length.
      const along = barcodeLength + quiet * 2

      // Bars as long as the box allows, never longer than the code is wide: past
      // that a barcode stops reading as one, and the scan gains nothing.
      for (let across = Math.min(acrossMax, barcodeLength); across >= minBars + MARGIN * 2; across -= 4) {
        // The printed code's row is the panel's own, so it lands on whichever
        // side of the panel the bars are not using.
        const plateW = (horizontal ? along : across) + (horizontal ? 0 : ROW)
        const plateH = (horizontal ? across : along) + (horizontal ? ROW : 0)
        if (!onGlass(plateW, plateH)) continue
        return {
          horizontal,
          barWidth,
          barcodeLength,
          // Bars keep their white on the far side but run flush into the code's
          // row, the way print sets a barcode on its own digits — so they gain
          // the margin they used to leave there.
          barLength: across - MARGIN,
          plateW,
          plateH,
        }
      }
    }
  }
  return null
}

// Returns false when nothing scannable could be drawn (a message is drawn in
// its place), so the caller can skip anything that only makes sense over a code.
export const Code = (card, box0) => {
  const type = typeOf(card)
  if (type === 'qr') {
    const cy = box0.y + (box0.h / 2 | 0)
    return QR(card, box0, box0.x + (box0.w / 2 | 0), cy)
  }

  const text = digits(type, card.code || '')
  const lines = encode(type, card.code || '')
  if (!lines || lines.length === 0) {
    message('Invalid barcode data', box0)
    return false
  }

  // Turned, the code is held off the long edges whatever the caller handed over.
  // The widget already reserves exactly this much for its chevrons, so the only
  // caller this moves is one that passed the whole screen.
  const held = (inset) => ({
    x: Math.max(box0.x, inset),
    y: box0.y,
    w: Math.min(box0.w, width - inset * 2),
    h: box0.h,
  })

  // A screen too small to hold a scannable code beside the name takes the band
  // back and goes without it rather than not showing the code at all.
  const measure = (flat, inset) => {
    const area = held(flat ? 0 : inset)
    const areaCy = area.y + (area.h / 2 | 0)
    // The name's band comes off the top upright, off the left turned; what is
    // left is the code's.
    const box = flat
      ? { x: area.x, y: area.y + BAND, w: area.w, h: area.h - BAND }
      : { x: area.x + COLUMN, y: area.y, w: area.w - COLUMN, h: area.h }
    const banded = fit(lines, box, areaCy, flat)
    return { flat, area, areaCy, box, banded, dims: banded || fit(lines, area, areaCy, flat) }
  }

  // Which way round is settled by the screen alone, and the margin is a
  // preference, not a requirement — both give way before the screen is allowed
  // to say "too long", in the order they cost the least. A narrow screen spends
  // that margin on nothing: TURN_EDGE is scaled off the height (the chevron it
  // matches is) but paid out of the width, and on Band 7's 194px it takes 40% of
  // it, leaving too little for the modules and the shortest scannable bar.
  const turned = turns()
  let laid = measure(!turned, TURN_EDGE)
  if (!laid.dims && turned) laid = measure(false, 0)
  if (!laid.dims) laid = measure(turned, 0)

  const { flat: horizontal, area, areaCy, box, banded, dims } = laid
  // Everything is centred on the box the code actually got, which is the area
  // less whatever the name took off it.
  const cx = box.x + (box.w / 2 | 0)

  // Past the input limits (Code 39 caps at 10 chars in settings) even 2px bars
  // don't fit — say so rather than draw an unreadable code.
  if (!dims) {
    message('Code too long\nto scan on\nthis screen', area)
    return false
  }

  // Without the band the code takes the whole area back, so it re-centres on it.
  const cy = place(banded ? box : area, areaCy, dims.plateH)
  const px = banded ? cx : area.x + (area.w / 2 | 0)

  const { barWidth, barcodeLength, barLength, plateW, plateH } = dims
  const plate = { x: px - (plateW / 2 | 0), y: cy - (plateH / 2 | 0), w: plateW, h: plateH }

  if (banded) {
    if (horizontal) name(card, area, plateW, plate.y)
    else nameColumn(card, area, plate)
  }
  panel(plate)

  // The bars sit in what the code's row leaves, so their block centre is half a
  // row off the panel's — above it upright, left of it turned — plus half the
  // margin they no longer leave against the row, which is what carries them onto
  // the numbers.
  const bars = (horizontal ? cy : px) - (ROW / 2 | 0) + (MARGIN / 2 | 0)
  const start = (horizontal ? px : cy) - (barcodeLength / 2 | 0)
  const edge = bars - (barLength / 2 | 0)

  // EAN-13's guards run deeper than the rest — far enough to read as guards,
  // short of the digits, which stay one evenly set run. They reach into the
  // code's own row, so they run whichever way that row does.
  const ean = type === 'ean13' && lines.length === EAN_MODULES
  const drop = ean ? Math.max(0, Math.min(barWidth * 5, ROW - 10) - 10) : 0

  lines.map((l, i) => {
    if (l !== 1) return
    const at = start + i * barWidth
    const guard = ean && (i < 3 || (i >= 45 && i < 50) || i >= 92)
    const deeper = guard ? drop : 0
    rect({
      centered: false,
      x: horizontal ? at : edge,
      y: horizontal ? edge : at,
      w: horizontal ? barWidth : barLength + deeper,
      h: horizontal ? barLength + deeper : barWidth,
      color: 0x000000,
    })
  })

  if (horizontal) printed(text, plate, barcodeLength)
  else printedColumn(text, plate, start, barcodeLength)
  return true
}
