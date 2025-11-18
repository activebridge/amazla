
import {
  onDigitalCrown,
  offDigitalCrown,
  onKey,
  showToast,
  KEY_EVENT_CLICK,
  KEY_EVENT_DOUBLE_CLICK,
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
      if (event == KEY_EVENT_DOUBLE_CLICK && [KEY_BACK, KEY_SHORTCUT].includes(key)) {
        showToast({ content: 'Double Click detected' })
      } else if (event == KEY_EVENT_LONG_PRESS && [KEY_BACK, KEY_SHORTCUT].includes(key)) {
        exit()
      } else if (event == KEY_EVENT_CLICK && [KEY_BACK, KEY_SHORTCUT].includes(key)) {
        showToast({ content: 'Click detected' })
      } else if (event == KEY_EVENT_CLICK && key == KEY_UP) {
        focus(-1)
      } else if (event == KEY_EVENT_CLICK && key == KEY_DOWN) {
        focus(1)
      } else if (event == KEY_EVENT_CLICK && [KEY_SELECT, KEY_HOME].includes(key)) {
        exec()
      } else {
        showToast({ content: `Click detected ${key}, ${event} ${KEY_EVENT_DOUBLE_CLICK}` })
      }

      return true
    }
  })
}

export const crownListener = onDigitalCrown({
  callback: (key, keyEvent) => {
    showToast({ content: 'Crown' })
    return true
  }
})
