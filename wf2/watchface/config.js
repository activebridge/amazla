import { editable } from '../../pages/ui.js'
import * as hmUI from '@zos/ui'

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
      { type: hmUI.edit_type.STEP,        preview: 'edit/labels-on.png' },
      { type: hmUI.edit_type.ALTIMETER,   preview: 'edit/labels-off.png' },
      { type: hmUI.edit_type.HEART,       preview: 'edit/labels-on.png' },
      { type: hmUI.edit_type.DISTANCE,    preview: 'edit/labels-off.png' },
    ],
  })
  var currentType = labelToggle.getProperty(hmUI.prop.CURRENT_TYPE)
  var labelsEnabled = !currentType
    || currentType === hmUI.edit_type.STEP
    || currentType === hmUI.edit_type.HEART

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
      { type: hmUI.edit_type.CAL,        preview: 'edit/time-dynamic.png' },
      { type: hmUI.edit_type.PAI_WEEKLY, preview: 'edit/time-static.png' },
      { type: hmUI.edit_type.STRESS,     preview: 'edit/time-off.png' },
    ],
  })
  var timeType = timeToggle.getProperty(hmUI.prop.CURRENT_TYPE)
  // Dynamic = CAL (default); Static = PAI_WEEKLY; Off = STRESS
  var timeMode = timeType === hmUI.edit_type.PAI_WEEKLY ? 'static'
               : timeType === hmUI.edit_type.STRESS     ? 'off'
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
      { type: hmUI.edit_type.WEATHER,   preview: 'edit/pointers-all.png' },
      { type: hmUI.edit_type.HUMIDITY,  preview: 'edit/pointers-hm.png' },
      { type: hmUI.edit_type.SPO2,       preview: 'edit/pointers-seconds.png' },
      { type: hmUI.edit_type.UVI,       preview: 'edit/pointers-off.png' },
    ],
  })
  var pointersType = pointersToggle.getProperty(hmUI.prop.CURRENT_TYPE)
  // All = WEATHER (default); Hour+Min = HUMIDITY; Seconds = WIND_SPEED; Off = UVI
  var pointersMode = pointersType === hmUI.edit_type.HUMIDITY   ? 'hm'
                   : pointersType === hmUI.edit_type.SPO2       ? 'seconds'
                   : pointersType === hmUI.edit_type.UVI        ? 'off'
                   : 'all'

  return { labelsEnabled, timeMode, pointersMode }
}
