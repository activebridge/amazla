import * as hmUI from "@zos/ui";
import { log as Logger } from "@zos/utils";
import jsSHA from "../../../utils/sha.js";

const logger = Logger.getLogger("otp-generator");
// It for testing the OTP generation
// For now without logic taking the secret keys from the user mobile app
// You can generate a new secret key using any base32 encoder
// For example, you can use the following online tool: https://www.base32encoder.com/

const secretKey = "";

function updateOtp(secret) {
  let key = base32tohex(secret);
  let epoch = Math.round(new Date().getTime() / 1000.0);
  let time = leftpad(dec2hex(Math.floor(epoch / 30)), 16, '0');
  let offset = 0;

  let shaObj = new jsSHA("SHA-1", "HEX");
  shaObj.setHMACKey(key, "HEX");
  shaObj.update(time);
  let hmac = shaObj.getHMAC("HEX");

  if (hmac == 'KEY MUST BE IN BYTE INCREMENTS') {
    logger.error("HMAC Error: Key must be in byte increments");
    return null;
  } else {
    offset = hex2dec(hmac.substring(hmac.length - 1));
  }

  let otp = (hex2dec(hmac.substr(offset * 2, 8)) & hex2dec('7fffffff')) + '';
  otp = (otp).substr(otp.length - 6, 6);

  return otp;
}

function dec2hex(s) { return (s < 15.5 ? '0' : '') + Math.round(s).toString(16); }
function hex2dec(s) { return parseInt(s, 16); }

function base32tohex(base32) {
    let base32chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bits = "";
    let hex = "";

    for (let i = 0; i < base32.length; i++) {
        let val = base32chars.indexOf(base32.charAt(i).toUpperCase());
        bits += leftpad(val.toString(2), 5, '0');
    }

    for (let i = 0; i+4 <= bits.length; i+=4) {
        let chunk = bits.substr(i, 4);
        hex = hex + parseInt(chunk, 2).toString(16) ;
    }
    return hex;

}

function leftpad(str, len, pad) {
    if (len + 1 >= str.length) {
        str = Array(len + 1 - str.length).join(pad) + str;
    }
    return str;
}

Page({
  otpText: null,

  onInit() {
    logger.debug("page onInit invoked");
    logger.debug("Generated OTP: " + updateOtp(secretKey));
  },

  build() {
    logger.debug("page build invoked");

    const testWidget = hmUI.createWidget(hmUI.widget.TEXT, {
      text: updateOtp(secretKey),
      x: 50,
      y: 100,
      color: 0xffffff,
      size: 40,
      align: "center",
    });
    logger.debug(testWidget, "otpText widget created");

    const updateOTP = () => {
      const otp = updateOtp(secretKey);
      logger.debug("ReGenerated OTP:", otp);
      testWidget.setProperty(hmUI.prop.TEXT, otp);
    };

    updateOTP();
    this.timer = setInterval(updateOTP, 30000);
  },

  onDestroy() {
    logger.debug("page onDestroy invoked");
    if (this.timer) clearInterval(this.timer);
  },
});
