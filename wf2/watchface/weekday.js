import { weekday, size } from '../../pages/ui.js'

export const Weekday = () => {
  const o = size / 2 - 20
  const x = Math.round(o * -0.866)  // cos(210°) for hour 10
  const y = Math.round(o * -0.5)    // sin(210°) for hour 10

  weekday({ x: x + 12, y, w: 0, h: 38, folder: 'weekday-label' })
  weekday({ x, y, w: 36, h: 36, folder: 'weekday' })
}
