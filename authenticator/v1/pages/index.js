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
// y/step hand the shared List() the v1 layout (3 cards below the title bar).
const DIMS_V1 = {
  ...DIMS,
  card: {
    ...DIMS.card,
    h: CARD_H,
    w: width,
    x: 0,
    y: TOP_PAD,
    step: STEP,
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

    if (accounts.length === 0) return;

    const n = accounts.length;
    // Background timer (column gradient, behind everything). Cover the full
    // content plus the last visible screen so max scroll never shows black.
    timerComp = Timer(n * STEP + height + TOP_PAD);
    timerComp.update(getTimeRemaining());

    // Shared List() — same async path as v3, with v1 dims.
    List(accounts, null, DIMS_V1);

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
