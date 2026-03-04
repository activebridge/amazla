import { delegate, editable } from '../../pages/ui.js'
import * as hmUI from '@zos/ui'
import { placeDigits, placeTime } from './digits.js'
import { placeSecondsPointer } from './seconds.js'
import { placeStatusIcons } from './status.js'
import { Heart } from './heart.js'
import { Weather } from './weather.js'
import { Weekday } from './weekday.js'
import { Moon } from './moon.js'
import { placeDateIcon } from './date.js'
import { Battery } from './battery.js'
import { Steps } from './steps.js'
import { Calories } from './calories.js'
import { Pai } from './pai.js'
import { Standing } from './standing.js'
import { placeZones } from './zones.js'
var timerId
var timeoutId

WatchFace({
  onInit() {},
  build() {
    // Labels on/off editable toggle (edit_id: 1)
    var labelToggle = editable({
      edit_id: 1,
      x: 0, y: 0, w: 60, h: 60,
      select_image: 'edit/labels-select.png',
      un_select_image: 'edit/labels-unselect.png',
      optional_types: [
        { type: hmUI.edit_type.STEP,        preview: 'edit/labels-on.png' },
        { type: hmUI.edit_type.ALTIMETER,   preview: 'edit/labels-off.png' },
        { type: hmUI.edit_type.HEART,       preview: 'edit/labels-on.png' },
        { type: hmUI.edit_type.DISTANCE,    preview: 'edit/labels-off.png' },
      ],
    })
    var currentType = labelToggle.getProperty(hmUI.prop.CURRENT_TYPE)
    // Labels ON = STEP or HEART; OFF = ALTIMETER or DISTANCE. Default ON if unset.
    var labelsEnabled = !currentType
      || currentType === hmUI.edit_type.STEP
      || currentType === hmUI.edit_type.HEART

    // placeGlance()
    placeStatusIcons(labelsEnabled)
    heartWidget = Heart(labelsEnabled)
    Weather(labelsEnabled)
    Weekday(labelsEnabled)
    Moon(labelsEnabled)
    placeDateIcon(labelsEnabled)
    Battery(labelsEnabled)
    Steps(labelsEnabled)
    Calories(labelsEnabled)
    Pai(labelsEnabled)
    Standing(labelsEnabled)
    placeSecondsPointer()

    // Create and update digits last so they are on top
    placeDigits()
    placeTime()
    // updateGlance()

    delegate(function () {
      placeTime()
      heartWidget.update()

      if (timerId) { clearInterval(timerId); timerId = null }
      if (timeoutId) { clearTimeout(timeoutId); timeoutId = null }

      // align to next minute boundary, then tick every 60s
      var delay = (60 - new Date().getSeconds()) * 1000
      timeoutId = setTimeout(function () {
        placeTime()
        timerId = setInterval(function () { placeTime() }, 60000)
      }, delay)
    }, function () {
      if (timerId) { clearInterval(timerId); timerId = null }
      if (timeoutId) { clearTimeout(timeoutId); timeoutId = null }
    })

    placeZones()
  },
  onDestroy() {},
})
