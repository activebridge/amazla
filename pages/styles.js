import * as hmUI from '@zos/ui'

export const LEVEL_COLORS = [
  0xF00F00,
  0xF07301,
  0xEFBA00,
  0xC4F001,
  0x00EF33,
  0x00EF33,
]

export const level_color = (val) => {
  const i = Math.floor(val / 20)
  return LEVEL_COLORS[i] || 0xFFFFFF
}

export const model = val => ['models', 'model3', 'modelx', 'modely'].includes(val) ? val : 'modely'

export const NAME = {
  h: 46,
  y: -120,
  text_size: 26,
  color: 0xffffff,
}

export const MAIN_BUTTON = {
  w: 300,
  h: 250,
  y: -40,
  normal_src: 'cars/modely.png',
  press_src: 'cars/modely.png',
}

export const CLOSE = {
  w: 120,
  h: 80,
  y: 120,
  normal_src: 'buttons/close.png',
  press_src: 'buttons/_close.png',
}

export const OPEN = {
  w: 120,
  h: 80,
  y: 110,
  normal_src: 'buttons/open.png',
  press_src: 'buttons/_open.png',
}

export const LOCK = {
  w: 120,
  h: 100,
  normal_src: 'buttons/unlock.png',
  press_src: 'buttons/_unlock.png',
}

export const UNLOCK = {
  w: 120,
  h: 100,
  normal_src: 'buttons/lock.png',
  press_src: 'buttons/_lock.png',
}

export const CABLE = {
  src: 'charging/charging_0.png',
  y: -42,
  x: 7,
  w: 300,
  h: 250,
}

export const CHARGING = {
  anim_path: 'charging',
  anim_prefix: 'charging',
  anim_ext: 'png',
  anim_fps: 20,
  anim_size: 26,
  repeat_count: 0,
  anim_status: hmUI.anim_status.START,
  y: -42,
  x: 7,
  w: 300,
  h: 250,
}

export const HVAC_ON = {
  w: 100,
  h: 60,
  y: 120,
  normal_src: 'buttons/on.png',
  press_src: 'buttons/_on.png',
}

export const HVAC_OFF = {
  w: 100,
  h: 60,
  y: 120,
  normal_src: 'buttons/off.png',
  press_src: 'buttons/_off.png',
}

export const DEFROST = {
  w: 50,
  h: 50,
  y: -150,
  x: 50,
  normal_src: 'buttons/defrost.png',
  press_src: 'buttons/_defrost.png',
}

export const UNDEFROST = {
  w: 50,
  h: 50,
  y: -150,
  x: 50,
  normal_src: 'buttons/undefrost.png',
  press_src: 'buttons/_undefrost.png',
}

export const SEATHEAT = {
  w: 45,
  h: 43,
  y: -30,
  x: 30,
  normal_src: 'buttons/heat_0.png',
  press_src: '',
}

export const ODOMETER = {
  h: 30,
  y: -150,
  color: 0xffffff,
  text_size: 20,
}

export const BATTERY_LEVEL = {
  h: 30,
  x: -58,
  y: 78,
  w: 60,
  color: 0xffffff,
  text_size: 30,
}

export const BATTERY_RANGE = {
  w: 80,
  h: 30,
  y: 80,
  x: 40,
  color: 0xf3f3f3,
  text_size: 30,
}

export const BATTERY = {
  y: 90,
  x: -59,
  radius: 30,
  start_angle: 25,
  end_angle: 335,
  color: 0x555555,
  line_width: 4,
  level: 100,
}
