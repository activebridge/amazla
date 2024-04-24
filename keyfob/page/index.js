import * as hmUI from '@zos/ui'
import { getDeviceInfo, SCREEN_SHAPE_SQUARE } from '@zos/device'
import { BasePage } from '@zeppos/zml/base-page';
import { writeFileSync, readFileSync } from '@zos/fs'

const readFile = () => {
  const vehicle = readFileSync({ path: 'vehicle.txt', options: { encoding: 'utf8' } })
  return JSON.parse(vehicle || '{}')
}

const writeFile = (data) => {
  return writeFileSync({ path: 'vehicle.txt', data: JSON.stringify(data), options: { encoding: 'utf8' } })
}

import UI, { page, button, img, text, circle, rect, progress, animation } from '../../pages/ui'
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
} from '../../pages/styles'
import vibrate from '../../pages/vibrate'
import { getColor } from '../../pages/paint'

const { height } = hmSetting?.getDeviceInfo() || getDeviceInfo()

let isRunning = false
let currentPage

const fetch = (method, onSuccess, onError) => {
  currentPage.request({ method }).then(({ error, ...props }) => {
    isRunning = false
    if (error) return onError(error)

    onSuccess(props)
  }).catch(error => {
    isRunning = false
    hmUI.showToast({ text: `ERROR: ${error}` })
  })
}

const render = (attrs) => {
  console.log('RENDER')
  console.log(JSON.stringify(attrs))
  UI.reset()
  const slide2 = page(0, 1)
  const slide1 = page(0, 0)
  const slide3 = page(0, 2)
  const slide4 = page(0, 3)
  const slide5 = page(0, 4)

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

  const isCooling = is_climate_on && inside_temp > driver_temp_setting
  const isHeating = is_climate_on && (isDefrosting || inside_temp <= driver_temp_setting)

  const car = `cars/${model(car_type)}`
  const chargeColor = isCharging ? 0x00EF33 : level_color(battery_level)
  const carColor = color ? `0x${color}` : chargeColor
  const climateColor = is_climate_on ? (isHeating ? 0xFF0000 : 0x0000FF ): 0x777777

  img({ w: 700, h: 750, src: `${car}.png` }, slide2)
  circle({ color: carColor, alpha: 155, radius: Math.floor(height / 2) }, slide2)
  img({ w: 880, h: 880, src: `${car}_bg.png` }, slide2)
  img({ w: 880, h: 880, src: `${car}_details.png` }, slide2)
  text({ ...NAME, text_size: 35, y: -110, text: name }, slide2)

  locked && img({ w: 352, h: 460, src: 'Y_Top_View_Dark.png' }, slide1)
  !locked && img({ w: 352, h: 460, src: 'Y_Top_View.png' }, slide1)
  frunk_open && img({ w: 352, h: 460, src: 'Y_Frunk.png' }, slide1)
  trunk_open && img({ w: 352, h: 460, src: 'Y_Trunk.png' }, slide1)
  pf && img({ w: 352, h: 460, src: 'Y_Right_Front_Door.png' }, slide1)
  pr && img({ w: 352, h: 460, src: 'Y_Right_Back_Door.png' }, slide1)
  df && img({ w: 352, h: 460, src: 'Y_Left_Front_Door.png' }, slide1)
  dr && img({ w: 352, h: 460, src: 'Y_Left_Back_Door.png' }, slide1)

  // button({
    //   ...MAIN_BUTTON,
    //   normal_src: `cars/${model(car_type)}.png`,
    //   press_src: `cars/${model(car_type)}.png`,
    //   click_func: refresh
    // }, slide2)

  frunk_open && button({ ...CLOSE, y: -150, w: 200, h: 160, click_func: frunk }, slide1)
  !frunk_open && button({ ...OPEN,  y: -160, w: 200, h: 160, click_func: frunk }, slide1)
  trunk_open && button({ ...CLOSE, y: 160, w: 200, h: 160, click_func: trunk }, slide1)
  !trunk_open && button({ ...OPEN, y: 150, w: 200, h: 160, click_func: trunk }, slide1)
  locked && button({ ...LOCK, w: 100, h: 110, click_func: unlock }, slide1)
  !locked && button({ ...UNLOCK, w: 100, h: 110, click_func: lock }, slide1)

  isConnected && img({ ...CABLE, y: 10, x: 28 }, slide2)
  isCharging && animation({ ...CHARGING, y: 10, x: 28 }, slide2)
  isCharging && text({ text: remaning, x: 30, w: 200, y: 120, text_size: 30 }, slide2)
  isConnected && !isCharging && text({ text: chargeStartAt, x: 30, w: 110, y: 50 }, slide2)

  text({ ...ODOMETER, y: height / 2 - 80, text_size: 30, color: 0x777777, text: `${odometer}${unit}` }, slide2)
  text({ ...BATTERY_LEVEL, y: -height / 2 + 70, w: 140, align_h: hmUI.align.LEFT, color: chargeColor, text_size: 40, text: `${battery_level || '--'}%` }, slide2)
  text({ ...BATTERY_RANGE, y: -height / 2 + 70, w: 140, x: 60, align_h: hmUI.align.RIGHT, h: 50, color: chargeColor, text_size: 40, text: `${battery_range}${unit}` }, slide2)
  rect({w: 40, h: 20, y: height/2 - 18, color: 0x000000 }, slide1)

  progress({ ...BATTERY, x: 0, y: -10, radius: height / 2 - 5, line_width: 10, start_angle: 5, end_angle: 355 }, slide2)
  progress({ ...BATTERY, x: 0, y: -10, radius: height / 2 - 5, line_width: 10, start_angle: 5, level: battery_level, color: chargeColor }, slide2)

  const limit = Math.floor(3.1 * soc_limit) + 41

  progress({
    ...BATTERY,
    start_angle: limit - 1,
    end_angle: limit + 3,
    line_width: 12,
    x: 0,
    y: -10,
    radius: height / 2 - 5,
    color: 0x000000,
  }, slide2)

  progress({
    ...BATTERY,
    start_angle: limit,
    end_angle: limit + 2,
    line_width: 10,
    color: 0xffffff,
    radius: height / 2 - 5,
    x: 0,
    y: -10,
  }, slide2)

  text({ text: `ϟ`, w: 50, y: -height/2 + 10, h: 50, align_v: hmUI.align.CENTER_V, text_size: 60, color: chargeColor }, slide2)
  !isChargerOpen && !isConnected && button({ x: 55, y: 15, w: 100, h: 100, src: `open_charger`, click_func: openCharger }, slide2)
  isChargerOpen && !isConnected && button({ x: 55, y: 15, w: 100, h: 100, src: `close_charger`, click_func: closeCharger }, slide2)

  img({ w: 280, h: 460, src: 'climat/bg.png' }, slide3)
  isCooling && img({ w: 263, h: 152, y: -100, src: 'climat/cooling.png' }, slide3)
  isHeating && img({ w: 263, h: 152, y: -100, src: 'climat/heating.png' }, slide3)
  text({ y: 15, text: insideTemp, text_size: 30 }, slide3)
  text({ y: -180, x: -90, text: outsideTemp, text_size: 30 }, slide3)
  text({ y: -130, x: 80, text: isMaxHeat ? 'HI' : climateTemp, text_size: 35, color: climateColor}, slide3)
  is_climate_on && button({ ...HVAC_OFF, y: 160, w: 100, h: 100, click_func: stopHVAC }, slide3)
  !is_climate_on && button({ ...HVAC_ON, y: 160, w: 100, h: 100, click_func: startHVAC }, slide3)
  button({ x: -67, y: -60, src: `heat_${shl}` }, slide3)
  button({ x: 70, y: -60, src: `heat_${shr}` }, slide3)
  button({ x: -62, y: 75, src: `heat_${shrl}` }, slide3)
  button({ x: 0, y: 75, src: `heat_${shrc}` }, slide3)
  button({ x: 62, y: 75, src: `heat_${shrr}` }, slide3)
  isDefrosting && button({ ...UNDEFROST, y: -180, x: 0, w: 100, h: 100, click_func: undefrost }, slide3)
  !isDefrosting && button({ ...DEFROST, y: -180, x: 0, w: 100, h: 100, click_func: defrost }, slide3)

  text({ h: 30, y: -70, text_size: 16, text: "COMMING SOON" }, slide4)
  text({ color: 0xF82127, y: 50, text: '♥', text_size: 69 }, slide4)
  text({ h: 30, y: 110, text_size: 16, text: "buymeacoffee.com/galulex" }, slide4)

  button({ x:50, y: -20, src: `flash` }, slide4)
  button({ x: -50, y: -120, src: `horn` }, slide4)
  button({ src: `homelink`, y: -20, x: -50 }, slide4)
  button({ x: 50, y: -120, src: `boombox` }, slide4)
  // text({ text: "⚽♀ ♁ ♂ • ¼☃1☂☀★☆☉☎☏☜☞☟☯♠ ♡ ♢ ♣ ♤ ♥ ♦ ♧ ♨ ♩ ♪ ♫ ♬ ♭ ♮ ♯ ♲ ♳ ♴ ♵ ♶ ♷ ♸ ♹ ♺ ♻ ♼ ♽⚠⚾ ✂ ✓ ✚ ✽ ✿ ❀ ❖ ❶ ❷ ❸ ❹ ❺ ❻ ❼ ❽ ❾ ❿ ➀ ➁ ➂ ➃ ➄ ➅ ➆ ➇ ➈ ➉ ➊ ➋ ➌ ➍ ➎ ➏ ➐ ➑ ➒ ➓ ➡ © ® ™ @ ¶ § ℀ ℃  ℅ ℉ ℊ ℓ № ℡  Ω ℧ Å ℮ ℵ ℻  ☖ ☗", text_size: 30 }, slide4)
  // text({ text: "", text_size: 30 }, slide4)

  // !online && circle({}, slide1)
  // !online && circle({}, slide2)
  // !online && circle({}, slide3)
  console.log('RENDERED')
}

const send = (method, { title = '🌐 Sending…', success = '🌐 OK', toast = false, vibro = true }) => {
  if (isRunning) return hmUI.showToast({ text: 'Busy…' })
  isRunning = true

  const onSuccess = ({ vehicle }) => {
    console.log("SUCCESS")
    writeFile(vehicle)
    render(vehicle)
    if (vibro) vibrate(24)
    if (toast) hmUI.showToast({ text: success })
    hmUI.updateStatusBarTitle(success)
    console.log("SUCCESSED")
  }

  const onError = error => {
    if (vibro) vibrate(0)
    if (toast) hmUI.showToast({ text: `${error}` })
    hmUI.updateStatusBarTitle('Offline')
  }

  hmUI.updateStatusBarTitle(title)
  if (toast) hmUI.showToast({ text: `${title}` })

  fetch(method, onSuccess, onError)
}

const refresh = () => send('VEHICLE_DATA', { title: '🌐 Sync…', success: '🌐 Online', vibro: false })
const lock = () => send('DOOR_LOCK', { toast: true })
const unlock = () => send('DOOR_UNLOCK', { toast: true })
const frunk = () => send('ACTUATE_FRUNK', { toast: true })
const trunk = () => send('ACTUATE_TRUNK', { toast: true })
const startHVAC = () => send('START_CONDITIONING', { toast: true })
const stopHVAC = () => send('STOP_CONDITIONING', { toast: true })
const heatSeat = () => send('HEAT_SEAT', { toast: true })
const defrost = () => send('DEFROST', { toast: true })
const undefrost = () => send('UNDEFROST', { toast: true })
const openCharger = () => send('OPEN_CHARGER', { toast: true })
const closeCharger = () => send('CLOSE_CHARGER', { toast: true })

Page(
  BasePage({
    state: {},

    build() {
      hmApp?.setScreenKeep(true)
      hmSetting?.setBrightScreen(300)
      currentPage = this

      render({ ...readFile(), ...{
        online: false,
        // online: true,
        // dr: true,
        // pf: true,
        // frunk_open: false,
        // trunk_open: true,
        // isCharging: true,
        // isConnected: true,
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
      setTimeout(() => {
        console.log('TIMEOUT')
        send('VEHICLE_DATA', { title: '🌐Sync…', success: '🌐Online', toast: true })
      }, 500)
    },
  })
)
