import { exit } from '@zos/router';

const { kpay } = getApp()._options.globalData;

Page({
  onInit() {
    kpay.pageInit();
  },
  build() {
    kpay.pageBuild();
  },
  onDestroy() {
    kpay.pageDestroy();
    // Purchase went through: kpay closes this page with back(), dropping the user onto
    // the main page exactly as it was BEFORE paying — still unlicensed, still showing
    // the Purchase button, and tapping it does nothing, because kpay skips its dialog
    // once the status is 'licensed' (device 2026-08-06: the button only cleared after
    // an app restart). A page has no resume hook to repair itself with, so leave the
    // app instead — the next launch builds licensed. Backing out WITHOUT paying is not
    // licensed, so that path stays in the app as before.
    if (kpay && kpay.isLicensed()) exit();
  },
});
