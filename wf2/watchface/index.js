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
import { placeZones } from './zones.js'
var timerId
var timeoutId

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
