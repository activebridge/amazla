
import {
  onDigitalCrown,
  offDigitalCrown,
  onKey,
  // showToast,
  KEY_EVENT_CLICK,
  KEY_EVENT_LONG_PRESS,
  KEY_UP,
  KEY_DOWN,
  KEY_BACK,
  KEY_SELECT,
  KEY_HOME,
  KEY_SHORTCUT,
} from '@zos/interaction'
import { exit } from '@zos/router'

export const keyListener = (focus, exec) => {
  onKey({
    callback: (key, event) => {
      if (event == KEY_EVENT_LONG_PRESS && [KEY_BACK, KEY_SHORTCUT].includes(key)) {
        exit()
      } else if (event == KEY_EVENT_CLICK && [KEY_BACK, KEY_SHORTCUT].includes(key)) {
        exec(true)
      } else if (event == KEY_EVENT_CLICK && key == KEY_UP) {
        focus(1)
      } else if (event == KEY_EVENT_CLICK && key == KEY_DOWN) {
        focus(-1)
      } else if (event == KEY_EVENT_CLICK && [KEY_SELECT, KEY_HOME].includes(key)) {
        exec()
      } else {
        // showToast({ content: `Click detected ${key}, ${event}` })
      }

      return true
    }
  })
}

// TODO does not work properly yet
export const crownListener = (focus) => {
  onDigitalCrown({
    callback: (key, deg) => {
      if (Math.abs(deg) < 2) return

      // showToast({ content: `Crown rotated ${deg}` })
      focus(Math.floor(deg/2))
    }
  })
}
