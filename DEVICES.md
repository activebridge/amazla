# Zepp / Amazfit Devices & Widget Sizing

Reference for screen geometry across Amazfit devices, plus how `getDeviceInfo()`
and `getAppWidgetSize()` behave differently on the **simulator** vs **real
hardware**. API levels cross-checked against the
[Zepp device list](https://docs.zepp.com/docs/v2/reference/related-resources/device-list/)
(2026-06; some newer models — T-Rex 3, T-Rex Ultra, Bip 6, Active Max, Active 3
Premium, Balance 2 — aren't on that page yet, so their API levels are best-effort).

## Scope: v2/v3 only

This app's app-widget uses `@zos` `getAppWidgetSize()`, which **does not exist on
ZeppOS v1**, so v1 devices are **out of scope** and excluded from testing. Per
the official list, these are v1: **GTS 3, GTS 4 Mini, GTR 3, GTR 3 Pro** (and
Band 7). Everything else below (API ≥ 2.0) is in scope. Bip 5 Unity is listed
under v1 on the doc but reports API 3.0 and runs the `@zos` path fine, so it's
treated as in scope.

## Device list

| Device | Resolution (W×H) | Shape | API | deviceSource |
|--------|------------------|-------|-----|--------------|
| Bip 5 | 320 × 380 | Square | 2.1 | `8454401` |
| Bip 5 Unity | 320 × 380 | Square | 3.0 | |
| Bip 6 | 390 × 450 | Square | 4.0 | `7995649`¹ |
| Active | 390 × 450 | Square | 3.6 | |
| Active Edge | 360 × 360 | Round | 3.5 | |
| Active 2 (Round) | 466 × 466 | Round | 4.2 | `10092803` |
| Active 2 (NFC) / 2R | 466 × 466 | Round | 4.2 | same as Active 2 (Round) |
| Active 2 (Square) | 390 × 450 | Square | 4.2 | `10223872` |
| Active Max | 480 × 480 | Round | 4.0 | |
| Active 3 Premium | 480 × 480 | Round | 4.0 | `10813699` |
| GTS 3 | 390 × 450 | Square | 1.0 (v1 — out of scope) | |
| GTS 4 | 390 × 450 | Square | 3.6 | `7995649`¹ |
| GTS 4 Mini | 336 × 384 | Square | 1.0 (v1 — out of scope) | |
| GTR Mini | 416 × 416 | Round | 2.0 | |
| GTR 3 | 454 × 454 | Round | 1.0 (v1 — out of scope) | |
| GTR 3 Pro | 480 × 480 | Round | 1.0 (v1 — out of scope) | |
| GTR 4 | 466 × 466 | Round | 3.6 | `7930113`² |
| Balance | 480 × 480 | Round | 3.7 | `7930113`² |
| Balance 2 | 480 × 480 | Round | 4.0 | `9568512` |
| Falcon | 416 × 416 | Round | 3.6 | `414` |
| Cheetah (Round) | 454 × 454 | Round | 3.6 | |
| Cheetah (Square) | 390 × 450 | Square | 3.6 | `8257793` |
| Cheetah Pro | 480 × 480 | Round | 3.6 | `8126720` |
| T-Rex 2 | 454 × 454 | Round | 2.1 | `418` |
| T-Rex 3 | 480 × 480 | Round | 4.0 | `8716544` |
| T-Rex Ultra | 454 × 454 | Round | 3.0 | `8192256` |

> `screenShape`: `1` = round, `0`/`SCREEN_SHAPE_SQUARE` = square/rect.
> `deviceSource` is a per-model integer — read it from the runtime log below
> rather than hardcoding (values vary and are not all published). Confirmed
> values are filled in above; the rest are blank until logged.
> **Note:** the simulator's `deviceSource` is **unreliable** — do not key
> behavior off it. It is sometimes empty (Bip 5 Unity, Active) and **inconsistent
> across models with the same screen**: at 390×450, GTS 4 and Bip 6 both report
> `7995649`¹ yet Active 2 (Square) reports `10223872` and Active reports empty —
> so it's neither unique-per-model nor keyed-by-resolution. It even collides
> across *different* resolutions: GTR 4 (466×466) and Balance (480×480) both
> report `7930113`² . Treat it as meaningless for layout; use
> `width`/`height`/`screenShape`.
>
> Observed in simulator (2026-06-17):
> - **T-Rex 3:** `[ui] getDeviceInfo: w=480 h=480 shape=1 source=8716544`
> - **Bip 5 Unity:** `[ui] getDeviceInfo: w=320 h=380 shape=0 source=` (empty)
> - **T-Rex 2:** `[ui] getDeviceInfo: w=454 h=454 shape=1 source=418`
> - **GTS 4:** `[ui] getDeviceInfo: w=390 h=450 shape=0 source=7995649`
> - **Active:** `[ui] getDeviceInfo: w=390 h=450 shape=0 source=` (empty)
> - **Bip 6:** `[ui] getAppWidgetSize: w=382 h=225 margin=4`
> - **Active 2 (Square):** `[ui] getAppWidgetSize: w=382 h=225 margin=4` (source `10223872`)
> - **Active 2 (Round):** `[ui] getAppWidgetSize: w=388 h=233 margin=39` (source `10092803`)
> - **Active Max:** `[ui] getAppWidgetSize: w=400 h=240 margin=40` (source empty; same as T-Rex 3)
> - **Active 3 Premium:** `[ui] getAppWidgetSize: w=400 h=240 margin=40` (source `10813699`)
> - **Cheetah Pro:** `[ui] getAppWidgetSize: w=400 h=240 margin=40 radius=36` (source `8126720`)
> - **Cheetah (Square):** `[ui] getAppWidgetSize: w=382 h=225 margin=4 radius=36` (source `8257793`)
> - **GTR 4:** `[ui] getAppWidgetSize: w=388 h=233 margin=39 radius=` (radius **empty** — same slot as Active 2 Round; source `7930113`)
> - **T-Rex Ultra:** `[ui] getAppWidgetSize: w=400 h=227 margin=27 radius=34` (454×454 — but T-Rex 2, also 454×454, returns `undefined`; source `8192256`)
> - **Balance:** `[ui] getAppWidgetSize: w=480 h=145 margin=0 radius=36` (480×480
>   **round**, sim reports **full width / margin 0**. ⚠️ **DEVICE-CONFIRMED the
>   sim is WRONG here:** the real Balance hardware **does reserve margins** (an
>   inset slot). So the sim's `margin=0` does NOT mean the device draws
>   full-width. source `7930113`, same as GTR 4)
> - **Balance 2:** `[ui] getAppWidgetSize: w=400 h=132 margin=40 radius=36` (480×480 — inset width like the standard 480s, but **h=132, not 240=H/2**; source `9568512`)
> - **Bip 5:** `[ui] getAppWidgetSize: undefined` (320×380 — but Bip 5 Unity, same 320×380, returns `304×190 m8`; source `8454401`)
> - **Falcon:** `[ui] getAppWidgetSize: w=347 h=208 margin=35 radius=31` (416×416, works — same res as GTR Mini which freezes)
> - **GTR Mini (416×416):** freezes on launch, **no logs** beyond the file-load
>   lines. **PROVEN sim/device-profile bug, NOT our code (2026-06-18):** stubbed
>   `app.js`, `app-widget/index.js`, AND `page/index.page.js` all down to empty
>   lifecycles with **zero imports** — still freezes. So it is not module-eval,
>   not `@zos/*` imports, not the timer/BLE/vibrator. Untestable in sim; validate
>   on real hardware only. **Not a resolution issue** — Falcon is also 416×416
>   and works fine. Freeze is device-profile-specific.
> - **Active Edge (360×360):** simulator freezes on launch (same as GTR Mini).
> - **Cheetah (454×454):** simulator freezes on launch. Note T-Rex 2 (also
>   454×454) runs but returns `undefined` — so again device-profile-specific.
>
> **Likely cause of the freezes (suspected, not the app-widget):** a custom
> round-only watchface (`wf2`, `targets: ["round"]`) the user built earlier. The
> freeze happens *before any `[ui]` log*, i.e. before the authenticator's
> `pages/ui.js` loads — so it's the active watchface crashing on certain round
> profiles, not the app-widget. Unrelated to the widget-sizing work.

## Reading dimensions at runtime

`pages/ui.js` derives every layout from `getDeviceInfo()`:

```js
export const { width, height, screenShape, deviceSource } = getDeviceInfo()
export const size = Math.min(width, height)
```

A **permanent console log** prints these on every launch — use it to confirm
what the current target (sim or device) actually reports:

```
[ui] getDeviceInfo: w=480 h=480 shape=1 source=<id>
```

`getDeviceInfo()` is **reliable on both simulator and hardware**. Use it for all
full-screen page layout.

## `getWidgetSize` / `getAppWidgetSize()` — sim vs device

App-widgets (the card shown on the watchface, `app-widget/index.js`) need the
**slot** they're rendered into, not the full screen. That comes from
`hmUI.getAppWidgetSize()`, wrapped in `pages/ui.js` as `getAppWidgetSize()`.

It is **not** as dependable as `getDeviceInfo()`:

It returns **either** a slot object **or** `undefined`, and which one is
**device-dependent** — not just a function of when you call it:

| Context | Behavior |
|---------|----------|
| **Module eval** (before `build()`) | `undefined` on every target |
| **Inside `build()`** | a slot on some devices, still `undefined` on others (e.g. T-Rex 2 sim) |

> **Observed on the simulator (2026-06-17):**
>
> `radius` was added to the log later, so most rows below predate it (—).
> `radius` is also **optional**: GTR 4 returns a slot but an empty radius (other
> 466×466 devices give 36). Code must fall back (`sz.radius || CARD_H*0.2`).
>
> | Device | Screen (`getDeviceInfo`) | Slot (`getAppWidgetSize`) | margin | radius | w = W−2·m? | h vs H |
> |--------|--------------------------|----------------------------|--------|--------|-----------|--------|
> | T-Rex 3 | 480 × 480 | 400 × 240 | 40 | — | 400 = 480−80 ✓ | 240 = 480/2 |
> | Bip 5 Unity | 320 × 380 | 304 × 190 | 8 | — | 304 = 320−16 ✓ | 190 = 380/2 |
> | T-Rex 2 | 454 × 454 | **`undefined`** | — | — | — | — |
> | Bip 5 | 320 × 380 | **`undefined`** | — | — | — | — |
> | Active | 390 × 450 | 390 × 140 | 0 | — | full width (not inset) | 140, fixed |
> | Bip 6 | 390 × 450 | 382 × 225 | 4 | — | 382 = 390−8 ✓ | 225 = 450/2 |
> | Active 2 (Square) | 390 × 450 | 382 × 225 | 4 | — | 382 = 390−8 ✓ | 225 = 450/2 |
> | Active 2 (Round) | 466 × 466 | 388 × 233 | 39 | — | 388 = 466−78 ✓ | 233 = 466/2 |
> | Active Max | 480 × 480 | 400 × 240 | 40 | — | 400 = 480−80 ✓ | 240 = 480/2 |
> | Active 3 Premium | 480 × 480 | 400 × 240 | 40 | — | 400 = 480−80 ✓ | 240 = 480/2 |
> | Falcon | 416 × 416 | 347 × 208 | 35 | 31 | 347 ≈ 416−70 (off-by-1) | 208 = 416/2 |
> | Cheetah Pro | 480 × 480 | 400 × 240 | 40 | 36 | 400 = 480−80 ✓ | 240 = 480/2 |
> | Cheetah (Square) | 390 × 450 | 382 × 225 | 4 | 36 | 382 = 390−8 ✓ | 225 = 450/2 |
> | GTR 4 | 466 × 466 | 388 × 233 | 39 | _empty_ | 388 = 466−78 ✓ | 233 = 466/2 |
> | T-Rex Ultra | 454 × 454 | 400 × 227 | 27 | 34 | 400 = 454−54 ✓ | 227 = 454/2 |
> | Balance | 480 × 480 | 480 × 145 | 0 | 36 | full width (not inset!) | 145, fixed |
> | Balance 2 | 480 × 480 | 400 × 132 | 40 | 36 | 400 = 480−80 ✓ (inset) | **132, NOT 240=H/2** |
> | GTS 4 | 390 × 450 | content clips right | ? | ? | ? | ? |
>
> Three states, not two — distinguish them:
> - **slot object** → app-widget `build()` ran and the OS gave geometry.
> - **`undefined`** → `build()` ran and called it, but the OS returned nothing.
> - **no `[ui] getAppWidgetSize` line at all** → `build()` never ran. The module
>   loaded (so `getDeviceInfo` logged) but the widget wasn't instantiated —
>   e.g. only the gallery **preview** is showing, not a widget tapped onto the
>   watchface. GTS 4 showed this: `getDeviceInfo` logged, `build()` had not fired.
>
> ⚠️ **The simulator's `margin` is not trustworthy.** On Balance the sim reports
> `margin=0` (full width), but the **real Balance hardware reserves margins**
> (device-confirmed). So a sim `margin=0` does **not** mean the device draws
> edge-to-edge — drawing full-width based on it will overflow the real slot (the
> GTS 4 clip symptom). Treat sim "full-width" results as suspect; assume hardware
> insets. The numbers below are **simulator** values unless marked device-confirmed.
>
> Takeaways:
> 1. **The slot shape is per-device, with no single rule — not even by shape or
>    resolution.** Most devices return an inset half-screen band (`w = width −
>    2·margin`, `h ≈ height/2`); some report **full width with `margin: 0`** and
>    a small fixed height (Active 390×140; Balance 480×145) — **but at least
>    Balance's full-width is a sim artifact; the real device insets.** These
>    forms cut across shape and size: at 480×480 round, four devices are inset
>    (400×240 m40), Balance reports full-width, Balance 2 is inset-but-short; at
>    454×454 round, T-Rex Ultra is inset, T-Rex 2 is `undefined`, Cheetah
>    freezes. You cannot predict the slot from `width`/`height`/`screenShape`,
>    and you cannot fully trust the sim's slot either — read it at runtime AND
>    inset defensively.
> 1a. **`w`/`margin` and `h` vary independently.** `h ≈ height/2` is NOT reliable
>    even when the width is inset: Balance 2 (480×480) returns inset `w=400 m40`
>    but `h=132` (not 240). So three height forms exist — half-screen (240),
>    full-width small (145), and inset small (132). Size content off the
>    *returned* `h`, never a computed `height/2`.
> 2. Some devices return `undefined` from `build()` (T-Rex 2, Bip 5). The current
>    `{ w: width, margin: 0 }` fallback is **full-width — and that's risky**,
>    because the real device likely reserves a margin (as Balance proved). A
>    safer fallback is a **conservative inset**: round → `margin ≈ 8%·width`,
>    square → `margin ≈ 2%·width`, `h = height/2`. Better to under-fill the slot
>    than overflow it.
> 3. **Can we predict the `undefined`/no-margin cases? No — only estimate.**
>    Same-screen twins differ (T-Rex 2 `undefined` vs T-Rex Ultra `400×227 m27`;
>    Bip 5 `undefined` vs Bip 5 Unity `304×190 m8`), so there's no formula. Best
>    estimates: borrow the twin, else apply the shape-based margin trend above.
>    The only fully safe rule is **always inset; never draw to the reported
>    full width**, since the sim under-reports margins.

Consequences:

1. **Never call it at module-eval.** It returns `undefined` there. Resolve
   geometry inside `build()` and fill module-level layout vars then (see
   `authenticator/app-widget/index.js`).
2. **Always handle `undefined` from `build()` too.** Some devices (T-Rex 2 sim)
   return no slot at all. Use the `{ w: width, margin: 0 }` fallback — it's
   load-bearing, not just a missing-API guard.
3. **When a slot exists, it's smaller than the screen** — on T-Rex 3 it's
   400×240 inside 480×480. Lay widgets out against `getAppWidgetSize()`'s
   `w`/`h`, not `getDeviceInfo()`'s `width`/`height`, or the card overflows.
4. **Hardware behavior is still unverified** in this project (no physical
   device). Don't assume sim == device; confirm on hardware when one is
   available, and update the tables above.

A **permanent console log** prints what the API returns each call:

```
[ui] getAppWidgetSize: w=400 h=240 margin=40      // T-Rex 3 simulator
[ui] getAppWidgetSize: undefined                  // called too early (module-eval)
```

It only fires from the **app-widget** context (the card on the watchface),
inside `build()` — the main page/app never calls `getAppWidgetSize()`, so you'll
only see `getDeviceInfo` there.

### Rule of thumb

- Full-screen pages/watchfaces → `getDeviceInfo()` (`width`/`height` from `ui.js`).
- App-widget slot → `getAppWidgetSize()`, **in `build()` only**, against its
  `w`/`h`, with a manual fallback. Re-verify on real hardware when available.
