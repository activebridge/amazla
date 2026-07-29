import { rect, img, width, height, isV1 } from "../../../pages/ui.js";

// The page background, and on round API-1.0 watches the only countdown there is:
// a horizontal gradient, black at the side edges -> timer color in the center,
// whose center color shifts FRESH -> WARN over the period. Behind the cards.
//
// Two implementations, same { update(remaining) }:
//   v2+  ONE solid rect under ONE static vignette PNG whose alpha carries the
//        edge falloff — 2 widgets, and only the rect is ever recolored.
//   v1   the same gradient faked from solid FILL_RECT columns, because API 1.0
//        can't stretch an image (and a tall one OOMs the engine).
const GREEN = 0xaff05b; // brightest green from the code gradient (calm)
const PINK = 0xf4468f; // pink end of the code gradient (warning)
const WARN_AT = 5; // last 5s ramp green -> pink; before that stays green
const COLS = 16; // gradient resolution across the width
const BAND = 0.3; // fraction of width that fades at each edge
const DIM_DARK = 0.2; // brightness during the calm (green) phase
const DIM_BRIGHT = 0.4; // brightness in the last seconds (pink warning)

function lerp(a, b, t) {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  return (((ar + (br - ar) * t) | 0) << 16) | (((ag + (bg - ag) * t) | 0) << 8) | ((ab + (bb - ab) * t) | 0);
}

// scale a color toward black by brightness b (0..1)
function dim(color, b) {
  return ((((color >> 16) & 0xff) * b | 0) << 16) | ((((color >> 8) & 0xff) * b | 0) << 8) | ((color & 0xff) * b | 0);
}

const OVER = 40; // extend past the top so ZeppOS overscroll still shows the bg

// Where the ramp is in the period. t: 0 calm -> 1 warning.
const rampAt = (remaining) => (remaining >= WARN_AT ? 0 : 1 - remaining / WARN_AT);

const Masked = (h) => {
  const box = { centered: false, x: 0, y: -OVER, w: width, h: h + OVER };
  // Solid color bar, recolored on the ramp; the mask over it is static.
  const bar = rect({ ...box, color: dim(GREEN, DIM_DARK) });
  if (bar.setEnable) bar.setEnable(false);
  // Vignette: pure black, alpha 254 at the side edges -> 0 in the center, so it
  // reproduces the columns' per-column dim() falloff in a single widget.
  const mask = img({ ...box, src: "timer_mask.png" });
  if (mask && mask.setEnable) mask.setEnable(false);

  let lastT = 0; // the bar is created at the calm color, i.e. the t = 0 state
  return {
    update: (remaining) => {
      const t = rampAt(remaining);
      if (t === 0 && lastT === 0) return; // nothing changes outside the last WARN_AT seconds
      lastT = t;
      const dimFactor = DIM_DARK + (DIM_BRIGHT - DIM_DARK) * t;
      bar.set({ ...box, color: dim(lerp(GREEN, PINK, t), dimFactor) });
    },
  };
};

const Columns = (h) => {
  // Half the step, so COLS columns laid end to end span half the screen — the
  // gradient is a band in the middle rather than something stretched edge to edge.
  // End to end (x = i * colW) and not on a separate width/COLS grid, or rounding
  // leaves gaps between them for the black page to show through as seams.
  const colW = Math.ceil(width / COLS / 2);
  const span = colW * COLS;
  const x0 = ((width - span) / 2) | 0; // centred
  const cols = [];
  for (let i = 0; i < COLS; i++) {
    const x = x0 + i * colW;
    const cx = (x - x0 + colW / 2) / span; // column center within the band, 0..1
    const edge = Math.min(cx, 1 - cx); // 0 at edges -> 0.5 at center
    const b = Math.min(1, edge / BAND); // column brightness profile 0 (edge) -> 1 (center)
    // init dark green so the bg shows even if setProperty(color) is flaky on a
    // device (e.g. bip5); update() recolors + rebrightens each second
    cols.push({ b, x, rect: rect({ centered: false, x, y: -OVER, w: colW, h: h + OVER, color: dim(GREEN, b * DIM_DARK) }) });
  }

  // The columns are created at the calm colour, i.e. the t = 0 state.
  let lastT = 0;

  return {
    update: (remaining) => {
      const t = rampAt(remaining);
      // Only the last WARN_AT seconds change anything: outside them every column
      // resolves to the colour it already has, so painting all COLS full-height
      // rects on those ticks costs a scroll's worth of work for no pixels. Paint
      // the ramp, plus the one tick that lands back on calm.
      if (t === 0 && lastT === 0) return;
      lastT = t;
      const color = lerp(GREEN, PINK, t);
      const dimFactor = DIM_DARK + (DIM_BRIGHT - DIM_DARK) * t; // darker until the last 5s
      for (let i = 0; i < COLS; i++) {
        // pass the full property set: some devices ignore a color-only MORE update
        cols[i].rect.set({
          centered: false,
          x: cols[i].x,
          y: -OVER,
          w: colW,
          h: h + OVER,
          color: dim(color, cols[i].b * dimFactor),
        });
      }
    },
  };
};

export const Background = (h = height) => (isV1 ? Columns(h) : Masked(h));
