import { delegate, editable } from '../../pages/ui.js'
import * as hmUI from '@zos/ui'
import { placeDigits, placeTime, resetTime } from './digits.js'
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

WatchFace({
  onInit() {},
  build() {
    // Labels on/off editable toggle (edit_id: 1)
    var labelToggle = editable({
      edit_id: 1,
      x: -100, y: 0, w: 150, h: 100,
      select_image: 'edit/labels-select.png',
      un_select_image: 'edit/labels-unselect.png',
      tips_BG: 'edit/tips-bg.png',
      tips_x: 0,
      tips_y: 0,
      tips_width: 0,
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

    // Dynamic/Static Time editable toggle (edit_id: 2)
    var timeToggle = editable({
      edit_id: 2,
      x: 100, y: 0, w: 150, h: 100,
      select_image: 'edit/labels-select.png',
      un_select_image: 'edit/labels-unselect.png',
      tips_BG: 'edit/tips-bg.png',
      tips_x: 0,
      tips_y: 0,
      tips_width: 0,
      optional_types: [
        { type: hmUI.edit_type.CAL,         preview: 'edit/time-dynamic.png' },
        { type: hmUI.edit_type.PAI_WEEKLY,  preview: 'edit/time-static.png' },
        { type: hmUI.edit_type.CAL,         preview: 'edit/time-dynamic.png' },
        { type: hmUI.edit_type.PAI_WEEKLY,  preview: 'edit/time-static.png' },
      ],
    })
    var timeType = timeToggle.getProperty(hmUI.prop.CURRENT_TYPE)
    // Dynamic = CAL (default); Static = PAI_WEEKLY
    var dynamicTime = !timeType || timeType !== hmUI.edit_type.PAI_WEEKLY

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
    if (dynamicTime) placeSecondsPointer()

    // Create and update digits last so they are on top
    placeDigits(dynamicTime)
    placeTime()
    // updateGlance()

    delegate(function () {
      placeTime()
      heartWidget.update()

      if (timerId) { timer.stopTimer(timerId); timerId = null }

      timerId = timer.createTimer(0, 1000, function () { resetTime(); placeTime() }, {})
    }, function () {
      if (timerId) { timer.stopTimer(timerId); timerId = null }
    })

    placeZones()
  },
  onDestroy() {},
})
