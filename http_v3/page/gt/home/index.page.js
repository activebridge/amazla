import * as hmUI from "@zos/ui";
import { log as Logger } from "@zos/utils";
import { TEXT_STYLE } from "zosLoader:./index.page.[pf].layout.js";
import { text } from "./../../../../pages/ui.js";

const logger = Logger.getLogger("helloworld");
Page({
  onInit() {
    logger.debug("page onInit invoked");
  },
  build() {
    logger.debug("page build invoked");
    text({ text: "   ", text_size: 40, font: "fonts/nerd-mono.ttf" });

  },
  onDestroy() {
    logger.debug("page onDestroy invoked");
  },
});
