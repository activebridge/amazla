import { readFile, writeFile } from './../shared/utils'
import UI, { page, button, img, text, circle, progress, animation } from './ui'
import {
  MAIN_BUTTON,
  NAME,
  CLOSE,
  OPEN,
  LOCK,
  UNLOCK,
  CHARGING,
  ODOMETER,
  BATTERY_LEVEL,
  BATTERY_RANGE,
  BATTERY,
  CABLE,
  HVAC_ON,
  HVAC_OFF,
  level_color,
  model,
  DEFROST,
  UNDEFROST,
} from './styles'
import vibrate from './vibrate'
import { getColor } from './paint'

const { messageBuilder } = getApp()._options.globalData;
const { height } = hmSetting.getDeviceInfo()

let isRunning = false

const fetch = (method, onSuccess, onError) => {
  messageBuilder.request({ method }).then(({ error, ...props }) => {
    isRunning = false
    if (error) return onError(error)

    onSuccess(props)
  }).catch(error => {
    hmUI.showToast({ text: `JS ERROR: ${error}` })
  })
}

const render = (attrs) => {
  const slide2 = page(0, 1)
  const slide1 = page(0, 0)
  const slide3 = page(0, 2)
  const slide4 = page(0, 3)
  const slide5 = page(0, 4)

  UI.reset()
  let vehicle = attrs || {}

  const {
    name = 'Connect Tesla Account',
    battery_level,
    battery_range = '- - -',
    online,
    locked,
    trunk_open,
    frunk_open,
    df,
    dr,
    pf,
    pr,
    unit = '㎖',
    odometer = '- - - - -',
    soc_limit,
    isCharging,
    isConnected,
    remaning,
    chargeStartAt,
    car_type,
    exterior_color,
    inside_temp,
    outside_temp,
    driver_temp_setting,
    insideTemp,
    outsideTemp,
    is_climate_on,
    climateTemp,
    shl = 0,
    shr = 0,
    shrl = 0,
    shrc = 0,
    shrr = 0,
    isMaxHeat = false,
    isDefrosting = false,
    color,
    isChargerOpen,
  } = vehicle
  console.log('=================')
  console.log(JSON.stringify(vehicle))

  const isCooling = is_climate_on && inside_temp > driver_temp_setting
  const isHeating = is_climate_on && (isDefrosting || inside_temp <= driver_temp_setting)

  const carColor = color ? `0x${color}` : getColor(exterior_color)
  const car = `cars/${model(car_type)}`
  img({ w: 300, h: 250, y: -40, src: `${car}.png` }, slide2)
  circle({ color: carColor, alpha: 155, radius: Math.floor(height / 4) }, slide2)
  img({ w: 480, h: 480, y: -40, src: `${car}_bg.png` }, slide2)
  img({ w: 480, h: 480, y: -40, src: `${car}_details.png` }, slide2)

  locked && img({ w: 252, h: 360, src: 'Y_Top_View_Dark.png' }, slide1)
  !locked && img({ w: 252, h: 360, src: 'Y_Top_View.png' }, slide1)
  frunk_open && img({ w: 252, h: 360, src: 'Y_Frunk.png' }, slide1)
  trunk_open && img({ w: 252, h: 360, src: 'Y_Trunk.png' }, slide1)
  pf && img({ w: 252, h: 360, src: 'Y_Right_Front_Door.png' }, slide1)
  pr && img({ w: 252, h: 360, src: 'Y_Right_Back_Door.png' }, slide1)
  df && img({ w: 252, h: 360, src: 'Y_Left_Front_Door.png' }, slide1)
  dr && img({ w: 252, h: 360, src: 'Y_Left_Back_Door.png' }, slide1)

  // button({
    //   ...MAIN_BUTTON,
    //   normal_src: `cars/${model(car_type)}.png`,
    //   press_src: `cars/${model(car_type)}.png`,
    //   click_func: refresh
    // }, slide2)

  text({ ...NAME, text: name }, slide2)

  frunk_open && button({ ...CLOSE, y: -110, click_func: frunk }, slide1)
  !frunk_open && button({ ...OPEN,  y: -120, click_func: frunk }, slide1)
  trunk_open && button({ ...CLOSE, click_func: trunk }, slide1)
  !trunk_open && button({ ...OPEN, y: 110, click_func: trunk }, slide1)
  locked && button({ ...LOCK, click_func: unlock }, slide1)
  !locked && button({ ...UNLOCK, click_func: lock }, slide1)

  isConnected && img(CABLE, slide2)
  isCharging && animation(CHARGING, slide2)
  isCharging && text({ text: remaning, x: 30, w: 110, y: 50 }, slide2)
  isConnected && !isCharging && text({ text: chargeStartAt, x: 30, w: 110, y: 50 }, slide2)

  text({ ...ODOMETER, text: `${odometer}${unit}` }, slide2)
  text({ ...BATTERY_LEVEL, text: battery_level || '--' }, slide2)
  text({ ...BATTERY_RANGE, text: `${battery_range}${unit}` }, slide2)

  progress(BATTERY, slide2)
  progress({ ...BATTERY, level: battery_level, color: level_color(battery_level) }, slide2)

  const limit = Math.floor(3.1 * soc_limit) + 15

  progress({
    ...BATTERY,
    start_angle: limit - 3,
    end_angle: limit + 23,
    line_width: 14,
    color: 0x000000,
  }, slide2)

  progress({
    ...BATTERY,
    start_angle: limit,
    end_angle: limit + 20,
    line_width: 10,
    color: 0xffffff,
  }, slide2)

  const charge_color = isCharging ? 0x00EF33 : level_color(battery_level)
  text({ text: `ϟ`, x: -59, w: 20, y: 40, h: 48, text_size: 40, color: charge_color }, slide2)
  !isChargerOpen && !isConnected && button({ x: 20, y: -30, w: 70, h: 70, src: `open_charger`, click_func: openCharger }, slide2)
  isChargerOpen && !isConnected && button({ x: 20, y: -30, w: 70, h:70, src: `close_charger`, click_func: closeCharger }, slide2)

  img({ w: 180, h: 360, src: 'climat/bg.png' }, slide3)
  isCooling && img({ w: 163, h: 52, y: -100, src: 'climat/cooling.png' }, slide3)
  isHeating && img({ w: 163, h: 52, y: -100, src: 'climat/heating.png' }, slide3)
  text({ y: 10, text: insideTemp, text_size: 20 }, slide3)
  text({ y: -150, x: -40, text: outsideTemp, text_size: 20 }, slide3)
  text({ y: -100, text: isMaxHeat ? 'HI' : climateTemp, text_size: 26}, slide3)
  is_climate_on && button({ ...HVAC_OFF, click_func: stopHVAC }, slide3)
  !is_climate_on && button({ ...HVAC_ON, click_func: startHVAC }, slide3)
  button({ x: -42, y: -45, src: `heat_${shl}` }, slide3)
  button({ x: 45, y: -45, src: `heat_${shr}` }, slide3)
  button({ x: -40, y: 55, src: `heat_${shrl}` }, slide3)
  button({ x: 2, y: 55, src: `heat_${shrc}` }, slide3)
  button({ x: 40, y: 55, src: `heat_${shrr}` }, slide3)
  isDefrosting && button({ ...UNDEFROST, click_func: undefrost }, slide3)
  !isDefrosting && button({ ...DEFROST, click_func: defrost }, slide3)

  text({ h: 30, y: -70, text_size: 16, text: "COMMING SOON" }, slide4)
  text({ color: 0xF82127, y: 50, text: '♥', text_size: 69 }, slide4)
  text({ h: 30, y: 110, text_size: 16, text: "buymeacoffee.com/galulex" }, slide4)

  button({ x:50, y: -20, src: `flash` }, slide4)
  button({ x: -50, y: -120, src: `horn` }, slide4)
  button({ src: `homelink`, y: -20, x: -50 }, slide4)
  button({ x: 50, y: -120, src: `boombox` }, slide4)
  // text({ text: "⚽♀ ♁ ♂ • ¼☃1☂☀★☆☉☎☏☜☞☟☯♠ ♡ ♢ ♣ ♤ ♥ ♦ ♧ ♨ ♩ ♪ ♫ ♬ ♭ ♮ ♯ ♲ ♳ ♴ ♵ ♶ ♷ ♸ ♹ ♺ ♻ ♼ ♽⚠⚾ ✂ ✓ ✚ ✽ ✿ ❀ ❖ ❶ ❷ ❸ ❹ ❺ ❻ ❼ ❽ ❾ ❿ ➀ ➁ ➂ ➃ ➄ ➅ ➆ ➇ ➈ ➉ ➊ ➋ ➌ ➍ ➎ ➏ ➐ ➑ ➒ ➓ ➡ © ® ™ @ ¶ § ℀ ℃  ℅ ℉ ℊ ℓ № ℡  Ω ℧ Å ℮ ℵ ℻  ☖ ☗", text_size: 30 }, slide4)
  // text({ text: "", text_size: 30 }, slide4)

  !online && circle({}, slide1)
  !online && circle({}, slide2)
  !online && circle({}, slide3)
}

const send = (method, { title = '🌐Sending…', success = '🌐OK', toast = false, vibro = true }) => {
  if (isRunning) return hmUI.showToast({ text: 'Busy…' })
  isRunning = true

  const onSuccess = ({ vehicle }) => {
    writeFile(vehicle)
    render(vehicle)
    if (vibro) vibrate(24)
    if (toast) hmUI.showToast({ text: 'OK' })
    return hmUI.updateStatusBarTitle(success)
  }

  const onError = error => {
    if (vibro) vibrate(0)
    if (toast) hmUI.showToast({ text: `${error}` })
    hmUI.updateStatusBarTitle('Offline')
  }

  hmUI.updateStatusBarTitle(title)

  fetch(method, onSuccess, onError)
}

const refresh = () => send('VEHICLE_DATA', { title: '🌐Sync…', success: '🌐Online', vibro: false })
const lock = () => send('DOOR_LOCK', { toast: true })
const unlock = () => send('DOOR_UNLOCK', { toast: true })
const frunk = () => send('ACTUATE_FRUNK', { toast: true })
const trunk = () => send('ACTUATE_TRUNK', { toast: true })
const startHVAC = () => send('START_HVAC', { toast: true })
const stopHVAC = () => send('STOP_HVAC', { toast: true })
const heatSeat = () => send('HEAT_SEAT', { toast: true })
const defrost = () => send('DEFROST', { toast: true })
const undefrost = () => send('UNDEFROST', { toast: true })
const openCharger = () => send('OPEN_CHARGER', { toast: true })
const closeCharger = () => send('CLOSE_CHARGER', { toast: true })

Page({
  state: {},

  build() {
    hmApp.setScreenKeep(true)
    hmSetting.setBrightScreen(300)

    render({ ...readFile(), ...{
      online: false,
      // online: true,
      // dr: true,
      // pf: true,
      // frunk_open: false,
      // trunk_open: true,
      // isCharging: false,
      // isConnected: false,
      // isChargerOpen: true,
      // soc_limit: 75,
      // name: 'Model Y',
      // car_type: 'modely',
      // odometer: 123456,
      // battery_level: 89,
      // battery_range: 333,
      // online: true,
      // remaning: '2hrs 20mins',
      // insideTemp: '12℃',
      // outsideTemp: '2℃',
      // climateTemp: '23℃',
      // inside_temp: 12,
      // driver_temp_setting: 23,
      // is_climate_on: true,
      // shl: 1,
      // exterior_color: 'Premium Signature Red',
      // color: 'C0C0C0',
    }})
    hmUI.setScrollView(true, height, 4, true)
    hmUI.scrollToPage(1, false)
    send('VEHICLE_DATA', { title: '🌐Sync…', success: '🌐Online' })
  },

})
