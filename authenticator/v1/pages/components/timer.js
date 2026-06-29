import { rect, width, height } from "../../../../pages/ui.js";

// v1 timer: a horizontal gradient built from solid FILL_RECT columns (rects
// scale to any height for free, unlike images which can't scale and OOM when
// tall on v1). Black at the side edges -> timer color in the center. The center
// color shifts FRESH -> WARN over the period. Behind the cards.
// (v2/v3 use the cheaper rect + mask-png version in page/components/timer-bg.js.)
const GREEN = 0xaff05b; // brightest green from the code gradient (calm)
const PINK = 0xf4468f; // pink end of the code gradient (warning)
const WARN_AT = 5; // last 5s ramp green -> pink; before that stays green
const COLS = 32; // gradient resolution across the width
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

export const Timer = (h = height) => {
  const colW = Math.ceil(width / COLS) + 1;
  const cols = [];
  for (let i = 0; i < COLS; i++) {
    const x = (i * width / COLS) | 0;
    const cx = (x + colW / 2) / width; // column center, 0..1
    const edge = Math.min(cx, 1 - cx); // 0 at edges -> 0.5 at center
    const b = Math.min(1, edge / BAND); // column brightness profile 0 (edge) -> 1 (center)
    // init dark green so the bg shows even if setProperty(color) is flaky on a
    // device (e.g. bip5); update() recolors + rebrightens each second
    cols.push({ b, x, rect: rect({ centered: false, x, y: -OVER, w: colW, h: h + OVER, color: dim(GREEN, b * DIM_DARK) }) });
  }

  return {
    update: (remaining) => {
      const t = remaining >= WARN_AT ? 0 : 1 - remaining / WARN_AT; // 0 calm -> 1 warning
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
