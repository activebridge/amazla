import { MessageBuilder } from "../shared/message-side";

const messageBuilder = new MessageBuilder();

const getAccounts = () => {
  try {
    const data = settings.settingsStorage.getItem("accounts");
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

AppSideService({
  onInit() {
    messageBuilder.listen(() => {});

    messageBuilder.on("request", (ctx) => {
      const payload = messageBuilder.buf2Json(ctx.request.payload);

      if (payload.method === "SYNC_ACCOUNTS") {
        ctx.response({ data: { accounts: getAccounts() } });
      }
    });
  },

  onRun() {},
  onDestroy() {},
});
