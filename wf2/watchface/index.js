import timer from '@zos/timer'
import { delegate } from '../../pages/ui.js'
import { placeMarkers } from './markers.js'
import { placeDigits, placeTime } from './digits.js'
import { placeSecondsPointer } from './seconds.js'
import { placeStatusIcons } from './status.js'
import { placeHeartIcon, updateHeart } from './heart.js'
import { placeWeatherIcon } from './weather.js'
import { placeWeekdayIcon } from './weekday.js'
import { placeDateIcon } from './date.js'
import { placeBatteryIcon } from './battery.js'
import { placeStepsIcon } from './steps.js'
import { placeCaloriesIcon } from './calories.js'
import { placePaiIcon } from './pai.js'
import { placeGlance, updateGlance } from './glance.js'
import { placeZones } from './zones.js'
var timerId

WatchFace({
  onInit() {},
  build() {
    placeMarkers()
    placeGlance()
    placeStatusIcons()
    placeHeartIcon()
    placeWeatherIcon()
    placeWeekdayIcon()
    placeDateIcon()
    placeBatteryIcon()
    placeStepsIcon()
    placeCaloriesIcon()
    placePaiIcon()
    placeSecondsPointer()
    
    // Create and update digits last so they are on top
    placeDigits()
    placeTime()
    updateGlance()

    delegate(function () {
      placeTime()
      updateGlance()
      updateHeart()

      if (timerId) timer.stopTimer(timerId)
      timerId = timer.createTimer(1000, 1000, function () { placeTime(); updateGlance() }, {})
    }, function () {
      if (timerId) { timer.stopTimer(timerId); timerId = null }
    })

    placeZones()
  },
  onDestroy() {},
})
