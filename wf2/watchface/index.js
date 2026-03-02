import timer from '@zos/timer'
import { delegate } from '../../pages/ui.js'
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
import { placeGlance, updateGlance } from './glance.js'
import { placeZones } from './zones.js'
var timerId

WatchFace({
  onInit() {},
  build() {
    // placeGlance()
    placeStatusIcons()
    heartWidget = Heart() // This is the best interface
    Weather()
    Weekday()
    Moon()
    placeDateIcon()
    Battery()
    Steps()
    Calories()
    Pai()
    Standing()
    placeSecondsPointer()

    // Create and update digits last so they are on top
    placeDigits()
    placeTime()
    // updateGlance()

    delegate(function () {
      placeTime()
      heartWidget.update()
      // updateGlance()

      if (timerId) timer.stopTimer(timerId)
      timerId = timer.createTimer(1000, 1000, function () { placeTime(); /* updateGlance() */ }, {})
    }, function () {
      if (timerId) { timer.stopTimer(timerId); timerId = null }
    })

    placeZones()
  },
  onDestroy() {},
})
