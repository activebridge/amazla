// One build for every device: v1 globals only (hmApp/hmUI/hmSetting/hmFS/hmBle),
// no @zos imports anywhere the watch evaluates. A single `import ... from '@zos/*'`
// compiles to a top-level __$$RQR$$__(...) the v1 runtime can't load.
import "./shared/device-polyfill";
import { MessageBuilder } from "./shared/message";

App({
  globalData: {
    messageBuilder: null,
  },

  onCreate() {
    if (!hmApp.packageInfo) {
      throw new Error("Set appId, appId needs to be the same as the configuration in app.json");
    }
    const { appId } = hmApp.packageInfo();
    const messageBuilder = new MessageBuilder({ appId });
    this.globalData.messageBuilder = messageBuilder;
    messageBuilder.connect();
  },

  onDestroy() {
    this.globalData.messageBuilder &&
      this.globalData.messageBuilder.disConnect();
  },
});
