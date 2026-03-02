// This is ideal widget structure with the sensor. Do not change here anything
import * as hmUI from '@zos/ui'
import { HeartRate } from '@zos/sensor'
import { img, size } from '../../pages/ui.js'

let widget
let sensor = new HeartRate()

export const update = () => {
  var hr = sensor.getCurrent() || 0
  var zone = hr < 1 ? 0 : hr < 100 ? 1 : hr < 120 ? 2 : hr < 140 ? 3 : hr < 160 ? 4 : 5
  widget.setProperty(hmUI.prop.MORE, { src: 'heart/' + zone + '.png' })
}

export const Heart = () => {
  const o = size / 2 - 20
  const x = Math.round(o * 0.5)    // cos(-60°) for hour 1
  const y = Math.round(o * -0.866) // sin(-60°) for hour 1

  widget = img({ x, y, w: 36, h: 36, src: 'heart/0.png' })
  update()
  sensor.onCurrentChange(update)

  return { widget, update }
}
