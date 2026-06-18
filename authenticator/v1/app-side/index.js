import { MessageBuilder } from "../shared/message";

const messageBuilder = new MessageBuilder();

function getAccounts() {
  try {
    return JSON.parse(settings.settingsStorage.getItem("accounts") || "[]");
  } catch (error) {
    return [];
  }
}

AppSideService({
  onInit() {
    messageBuilder.listen(() => { });

    messageBuilder.on("request", (ctx) => {
      const payload = messageBuilder.buf2Json(ctx.request.payload);

      if (payload.method === "SYNC_ACCOUNTS") {
        return ctx.response({ data: { accounts: getAccounts() } });
      }
    });
  },

  onRun() { },

  onDestroy() { },
});
