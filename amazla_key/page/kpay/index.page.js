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
  },
});
