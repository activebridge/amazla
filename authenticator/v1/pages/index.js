import UI, { height, width } from "../../../pages/ui.js";
import { Timer } from "./components/timer.js";
import { List, updateCodes, DIMS } from "../../page/components/list.js";
import { getTimeRemaining } from "../../page/libs/totp.js";
import { readAccounts, writeAccounts } from "../utils/fs";

const { messageBuilder } = getApp()._options.globalData;

// v1 dims. The slot (STEP) must fit 3 cards in the area BELOW the title bar,
// so it's based on (height - BAR_H), not full height — otherwise the visible
// status bar pushes the 3rd card off-screen. Cards span the full device width.
const BAR_H = width === height ? 0 : (width / 12) | 0; // title-bar height on tall screens (~width/12)
const GAP = 20; // inter-card gap (tune)
const STEP = ((height - BAR_H) / 3) | 0; // 3 cards fit below the bar
const CARD_H = STEP - GAP;
// Pad the first card below the title bar (square) by bar height + one gap.
// Round has no bar -> tiny pad.
const TOP_PAD = width === height ? 10 : BAR_H + GAP;
// Cards are capped at 330px and centered; narrow screens (Band 7) just get
// the full device width.
const CARD_W = Math.min(width, 330);
const CARD_X = (width - CARD_W) / 2 | 0;
// y/step hand the shared List() the v1 layout (3 cards below the title bar).
const DIMS_V1 = {
  ...DIMS,
  card: {
    ...DIMS.card,
    h: CARD_H,
    w: CARD_W,
    x: CARD_X,
    y: TOP_PAD,
    step: STEP,
  },
  // API 1.0 TEXT has no custom-font support (widget renders nothing) — null
  // opts out of the Jua default so codes use the system font.
  digit: {
    ...DIMS.digit,
    font: null,
  },
};

const PERIOD = 30;

let ticker = null;
let timerComp = null;

// 6-cell depleting bar for the title bar.
function countdownBar() {
  const seg = Math.round((getTimeRemaining() / PERIOD) * 6);
  return "█".repeat(seg) + "░".repeat(6 - seg);
}

Page({
  state: {
    accounts: readAccounts(),
  },

  build() {
    this.render();
    hmUI.updateStatusBarTitle(countdownBar());
    this.startTimer();
    setTimeout(() => this.sync(), 500);
  },

  render() {
    const accounts = this.state.accounts;
    const n = accounts.length;

    // Background timer (column gradient, behind everything). Cover the full
    // content plus the last visible screen so max scroll never shows black.
    if (n > 0) {
      timerComp = Timer(n * STEP + height + TOP_PAD);
      timerComp.update(getTimeRemaining());
    }

    // Shared List() — same async path as v3, with v1 dims. Also renders the
    // "No accounts" empty state, so it must run even with zero accounts.
    List(accounts, null, DIMS_V1);

    if (n === 0) return;

    // Scrollable list (old API works on v1/v2, crown included). Cap at n pages
    // so you can't scroll past the last card into an empty page below the heart.
    const pages = Math.max(1, n);
    hmUI.setScrollView(true, STEP, pages, true);
    hmUI.scrollToPage(Math.min(1, pages - 1), false);
  },

  sync() {
    messageBuilder
      .request({ method: "SYNC_ACCOUNTS" })
      .then((data) => {
        const accounts = data && data.accounts;
        if (!accounts) return;
        if (JSON.stringify(this.state.accounts) === JSON.stringify(accounts)) return;

        this.state.accounts = accounts;
        writeAccounts(accounts);
        UI.reset();
        this.render();
      })
      .catch(() => {});
  },

  startTimer() {
    ticker = setInterval(() => {
      const remaining = getTimeRemaining();
      hmUI.updateStatusBarTitle(countdownBar());
      if (timerComp) timerComp.update(remaining);
      if (remaining === PERIOD) updateCodes();
    }, 1000);
  },

  onDestroy() {
    if (ticker) clearInterval(ticker);
    UI.reset();
  },
});
