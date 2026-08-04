// One stylesheet for every injected control — the edit dialog and the config
// panel share it, so a field looks the same wherever it appears.
//
// Palette is HTTP's own light glass (see ../styles.js): white translucent panels
// over the purple/blue page gradient, not amazwallet's dark glass. The values
// here are the JS style objects of styles.js written as CSS — CARD becomes
// .g-panel/.g-box, INPUT_STYLE becomes .g-input.
export const injectGlassStyles = (doc) => {
  if (doc.querySelector('#http-glass')) return
  const style = doc.createElement('style')
  style.id = 'http-glass'
  style.textContent = `
    @keyframes g-overlay-in { from { opacity: 0; } to { opacity: 1; } }
    @keyframes g-box-in {
      from { opacity: 0; transform: translateY(12px) scale(0.96); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    /* The action list stays visible and blurred behind the dialog, so the panel
       reads as frosted glass laid over the page rather than a solid sheet. The
       page gradient showing through is what sells it — keep the scrim light. */
    .g-overlay {
      position: fixed; inset: 0;
      background: rgba(20, 10, 45, 0.45);
      -webkit-backdrop-filter: blur(3px);
      backdrop-filter: blur(3px);
      display: flex; align-items: center; justify-content: center;
      z-index: 10000;
      animation: g-overlay-in 220ms ease both;
    }
    .g-overlay.g-closing { animation: g-overlay-in 200ms ease reverse both; }

    .g-box, .g-panel {
      border-radius: 20px;
      background: rgba(255, 255, 255, 0.35);
      -webkit-backdrop-filter: blur(20px);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.3);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
      color: white;
      font-family: Circular, Helvetica, Arial, sans-serif;
      box-sizing: border-box;
    }
    .g-box {
      width: min(92vw, 440px); max-height: 95vh;
      padding: 16px 20px 24px;
      display: flex; flex-direction: column;
      animation: g-box-in 260ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
    }
    .g-overlay.g-closing .g-box { animation: g-box-in 220ms cubic-bezier(0.4, 0, 1, 1) reverse both; }
    .g-panel {
      width: 100%;
      padding: 4px 20px 20px;
      margin-bottom: 40px;
      display: flex; flex-direction: column;
    }

    .g-header {
      display: flex; flex-direction: row; align-items: center;
      margin: 0 -8px 12px; padding-bottom: 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.3); flex-shrink: 0;
    }
    .g-x {
      width: 36px; height: 36px; flex-shrink: 0;
      background: none; border: none; cursor: pointer;
      color: white; font-size: 18px; line-height: 1;
      display: flex; align-items: center; justify-content: center;
    }
    .g-x-spacer { width: 36px; flex-shrink: 0; }
    .g-title { flex: 1; text-align: center; font-size: 17px; font-weight: 600; }
    .g-body { overflow-y: auto; display: flex; flex-direction: column; }

    .g-label {
      font-size: 12px; color: rgba(255, 255, 255, 0.75); margin: 14px 0 6px;
      text-transform: uppercase; letter-spacing: 0.5px; cursor: pointer;
    }

    /* Fields are wells cut into the panel: darker than the glass around them,
       with the inset shadow doing the depth. */
    .g-input, .g-textarea, .g-select {
      width: 100%; box-sizing: border-box;
      padding: 10px 14px; border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.2); outline: none;
      background: rgba(255, 255, 255, 0.1);
      -webkit-backdrop-filter: blur(10px);
      backdrop-filter: blur(10px);
      color: white; font-size: 16px; font-family: inherit;
      box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.2), inset 0 1px 4px rgba(0, 0, 0, 0.1);
      transition: border-color 160ms ease, background 160ms ease;
    }
    .g-input::placeholder, .g-textarea::placeholder { color: rgba(255, 255, 255, 0.5); }
    .g-input:focus, .g-textarea:focus, .g-select:focus {
      border-color: rgba(255, 255, 255, 0.75);
      background: rgba(255, 255, 255, 0.18);
    }
    .g-textarea { resize: vertical; min-height: 76px; line-height: 1.4; }

    /* appearance:none kills the native arrow, so the chevron is drawn here. */
    .g-select {
      -webkit-appearance: none; appearance: none; cursor: pointer;
      padding-right: 38px;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='white'%3E%3Cpath d='M8 11L3 5.5h10z'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 14px center;
      background-size: 12px;
    }
    /* The dropdown itself is a native popup painted on the OS surface — white
       text there would land on white. */
    .g-select option { color: #2a1e63; background: #ffffff; }

    /* Native validity styling, border only. :not(:placeholder-shown) keeps an
       untouched empty field neutral; :focus:invalid shows red once a failed
       submit has focused it. */
    .g-validate:not(:placeholder-shown):valid { border-color: rgba(129, 199, 132, 0.85); }
    .g-validate:not(:placeholder-shown):invalid { border-color: rgba(255, 120, 110, 0.9); }
    .g-validate:focus:invalid { border-color: rgba(255, 120, 110, 0.9); }

    /* Two fields side by side. The columns own their labels, so each one keeps
       the same label-then-field rhythm as a full-width field above it. */
    .g-row { display: flex; flex-direction: row; gap: 12px; }
    .g-col { display: flex; flex-direction: column; flex: 1; min-width: 0; }
    /* A single glyph needs far less room than "DELETE". */
    .g-col-sm { flex: 0 0 34%; }

    /* The rail is drawn with real elements and the input is laid transparent on
       top of them: the fill and the four stop dots are then plain boxes with
       plain widths, rather than gradients computed inside a track pseudo.
       The wrapper's 10px side padding is half the thumb, so the track spans
       exactly the distance the thumb's centre travels: the dots then land under
       the knob positions and the fill ends under the knob. */
    .g-range-wrap {
      position: relative;
      height: 28px;
      padding: 0 10px;
      box-sizing: border-box;
    }
    .g-range-track {
      position: absolute; left: 10px; right: 10px; top: 50%;
      transform: translateY(-50%);
      height: 4px; border-radius: 2px;
      background: rgba(255, 255, 255, 0.1);
      box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.35);
      display: flex; flex-direction: row;
      align-items: center; justify-content: space-between;
    }
    .g-range-fill {
      position: absolute; left: 0; top: 0; bottom: 0;
      border-radius: 2px;
      background: rgba(255, 255, 255, 0.5);
    }
    .g-range-dot {
      position: relative;
      width: 6px; height: 6px; border-radius: 50%;
      background: rgba(255, 255, 255, 0.45);
      box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.3);
    }
    /* The end dots would otherwise sit inside the track by their own width. */
    .g-range-dot:first-of-type { margin-left: -3px; }
    .g-range-dot:last-of-type { margin-right: -3px; }

    /* Exactly thumb-high and centred on the rail. At full height the thumb rode
       wherever the native track sat inside the box — below the rail, on the
       numbers. At 20px there is nowhere for it to go but on the rail. */
    .g-range {
      position: absolute; left: 0; top: 50%;
      transform: translateY(-50%);
      width: 100%; height: 20px;
      -webkit-appearance: none; appearance: none;
      margin: 0; padding: 0; background: transparent; cursor: pointer;
    }
    .g-range:focus { outline: none; }
    .g-range::-webkit-slider-runnable-track { height: 100%; background: transparent; border: none; }
    .g-range::-webkit-slider-thumb {
      -webkit-appearance: none; appearance: none;
      width: 20px; height: 20px; border-radius: 50%;
      background: rgba(255, 255, 255, 0.75);
      border: 1px solid rgba(255, 255, 255, 0.8);
      box-shadow: 0 3px 10px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.9);
    }
    /* The datalist is laid out as the value scale under the rail. Its own side
       padding matches the wrapper's, so each number sits under its dot. */
    .g-range-wrap + datalist {
      display: flex; flex-direction: row; justify-content: space-between;
      padding: 11px 6px 0;
      font-size: 11px; color: rgba(255, 255, 255, 0.6);
    }
    .g-range-wrap + datalist option { padding: 0; }
    .g-switches { margin-top: 16px; }
    .g-switch {
      display: flex; flex-direction: row; align-items: center; justify-content: space-between;
      gap: 12px; padding: 12px 0; cursor: pointer;
      border-bottom: 1px solid rgba(255, 255, 255, 0.15);
      font-size: 15px;
    }
    .g-switch:last-child { border-bottom: none; }
    .g-switch input { position: absolute; opacity: 0; width: 0; height: 0; }
    .g-track {
      position: relative; flex-shrink: 0;
      width: 46px; height: 26px; border-radius: 13px;
      background: rgba(255, 255, 255, 0.15);
      border: 1px solid rgba(255, 255, 255, 0.25);
      box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.2);
      transition: background 200ms ease;
    }
    .g-track::after {
      content: ''; position: absolute; top: 2px; left: 2px;
      width: 20px; height: 20px; border-radius: 50%;
      background: white; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
      transition: transform 200ms ease;
    }
    .g-switch input:checked + .g-track { background: rgba(120, 220, 150, 0.7); }
    .g-switch input:checked + .g-track::after { transform: translateX(20px); }

    .g-actions { display: flex; flex-direction: row; gap: 10px; margin-top: 24px; }
    .g-save, .g-run {
      flex: 1; padding: 14px; border-radius: 24px;
      border: 1px solid rgba(255, 255, 255, 0.35);
      color: white; font-size: 15px; font-weight: 500; font-family: inherit;
      cursor: pointer;
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.4);
    }
    .g-run {
      flex: 0 0 auto; padding: 14px 20px;
      background: rgba(80, 200, 130, 0.55);
      -webkit-backdrop-filter: blur(10px);
      backdrop-filter: blur(10px);
    }
    .g-save { background: rgba(255, 255, 255, 0.45); color: #2a1e63; font-weight: 600; }

    /* Outside .g-body on purpose: pinned to the bottom of the dialog instead of
       scrolling with the fields, or the answer to Run lands out of view. */
    /* A row, not a floated button in a text block: the float shortened only the
       first line, which left the response looking indented, and the page's
       inherited centering finished the job. */
    .g-result {
      display: flex; flex-direction: row; align-items: flex-start; gap: 8px;
      flex-shrink: 0;
      margin-top: 14px; padding: 10px 12px 10px 14px; border-radius: 12px;
      background: rgba(0, 0, 0, 0.25);
      font-family: monospace; font-size: 13px; line-height: 1.4;
      color: rgba(255, 255, 255, 0.95);
      text-align: left;
    }
    .g-result[hidden] { display: none; }
    /* The text scrolls, not the panel, so the dismiss button stays put. */
    .g-result-text {
      flex: 1; min-width: 0;
      max-height: 100px; overflow-y: auto;
      white-space: pre-wrap; word-break: break-word;
    }
    .g-result-x {
      flex-shrink: 0;
      width: 22px; height: 22px; padding: 0;
      background: none; border: none; cursor: pointer;
      color: rgba(255, 255, 255, 0.7); font-size: 13px; line-height: 1;
    }
  `
  doc.head.appendChild(style)
}
