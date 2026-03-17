import { delegate } from '../../pages/ui.js'
import { createTimer } from '@zos/timer'
import { getConfig } from './config.js'
import { placeDigits, placeTime } from './digits.js'
import { Pointers } from './pointers.js'
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

WatchFace({
  onInit() {},
  build() {
    var { labelsEnabled, timeMode, pointersMode } = getConfig()

    placeStatusIcons(labelsEnabled)
    heartWidget = Heart(labelsEnabled)
    heartWidget.update()
    Weather(labelsEnabled)
    Weekday(labelsEnabled)
    Moon(labelsEnabled)
    placeDateIcon(labelsEnabled)
    Battery(labelsEnabled)
    Steps(labelsEnabled)
    Calories(labelsEnabled)
    Pai(labelsEnabled)
    Standing(labelsEnabled)
    if (pointersMode !== 'off') Pointers(pointersMode)

    // Create and update digits last so they are on top
    placeDigits(timeMode)
    if (timeMode !== 'off') placeTime()

    delegate(function () {
      if (timeMode !== 'off') placeTime()
      heartWidget.update()
    }, function () {})

    try {
      createTimer(0, 1000, function () {
        if (timeMode !== 'off') placeTime()
        heartWidget.update()
      }, {})
    } catch (e) {}

    placeZones()
  },
  onDestroy() {},
})
