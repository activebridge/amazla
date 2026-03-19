import { editable } from '../../pages/ui.js'
import { edit_type, prop } from '@zos/ui'

export function getConfig() {
  var labelToggle = editable({
    edit_id: 1,
    x: -75, y: -20, w: 150, h: 100,
    select_image: 'edit/labels-select.png',
    un_select_image: 'edit/labels-unselect.png',
    tips_BG: 'edit/tips-bg.png',
    tips_x: 0,
    tips_y: 0,
    tips_width: 0,
    optional_types: [
      { type: edit_type.STEP,        preview: 'edit/labels-on.png' },
      { type: edit_type.ALTIMETER,   preview: 'edit/labels-off.png' },
      { type: edit_type.HEART,       preview: 'edit/labels-on.png' },
      { type: edit_type.DISTANCE,    preview: 'edit/labels-off.png' },
    ],
  })
  var currentType = labelToggle.getProperty(prop.CURRENT_TYPE)
  var labelsEnabled = !currentType
    || currentType === edit_type.STEP
    || currentType === edit_type.HEART

  var timeToggle = editable({
    edit_id: 2,
    x: 75, y: -20, w: 150, h: 100,
    select_image: 'edit/labels-select.png',
    un_select_image: 'edit/labels-unselect.png',
    tips_BG: 'edit/tips-bg.png',
    tips_x: 0,
    tips_y: 0,
    tips_width: 0,
    optional_types: [
      { type: edit_type.CAL,        preview: 'edit/time-dynamic.png' },
      { type: edit_type.PAI_WEEKLY, preview: 'edit/time-static.png' },
      { type: edit_type.STRESS,     preview: 'edit/time-off.png' },
    ],
  })
  var timeType = timeToggle.getProperty(prop.CURRENT_TYPE)
  // Dynamic = CAL (default); Static = PAI_WEEKLY; Off = STRESS
  var timeMode = timeType === edit_type.PAI_WEEKLY ? 'static'
               : timeType === edit_type.STRESS     ? 'off'
               : 'dynamic'

  var pointersToggle = editable({
    edit_id: 3,
    x: 0, y: 80, w: 150, h: 100,
    select_image: 'edit/labels-select.png',
    un_select_image: 'edit/labels-unselect.png',
    tips_BG: 'edit/tips-bg.png',
    tips_x: 0,
    tips_y: 0,
    tips_width: 0,
    optional_types: [
      { type: edit_type.WEATHER,   preview: 'edit/pointers-all.png' },
      { type: edit_type.HUMIDITY,  preview: 'edit/pointers-hm.png' },
      { type: edit_type.SPO2,       preview: 'edit/pointers-seconds.png' },
      { type: edit_type.UVI,       preview: 'edit/pointers-off.png' },
    ],
  })
  var pointersType = pointersToggle.getProperty(prop.CURRENT_TYPE)
  // All = WEATHER (default); Hour+Min = HUMIDITY; Seconds = WIND_SPEED; Off = UVI
  var pointersMode = pointersType === edit_type.HUMIDITY   ? 'hm'
                   : pointersType === edit_type.SPO2       ? 'seconds'
                   : pointersType === edit_type.UVI        ? 'off'
                   : 'all'

  return { labelsEnabled, timeMode, pointersMode }
}
