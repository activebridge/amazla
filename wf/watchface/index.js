import { editable, time, weather, width, height, temperature, date, battery, charge, group, click, circle, text, polyline, animation, textImg, alarm, disconnect, dnd, lock } from "../../pages/ui.js"
import * as hmUI from '@zos/ui'
import { flash } from "./components/flash.js"

WatchFace({
  onInit() {
    console.log('index page.js on init invoke')
  },

  build() {
    console.log('index page.js on build invoke')

    // Weather background edit group
    const weatherEditGroup = editable({
      edit_id: 2,
      x: 0,
      y: 0,
      w: 50,
      h: 50,
      select_image: 'edit/weather-select.png',
      un_select_image: 'edit/weather-unselect.png',
      optional_types: [
        { type: hmUI.edit_type.WEATHER, preview: 'edit/weather-on.png' },
        { type: hmUI.edit_type.ALTIMETER, preview: 'edit/weather-off.png' },
        { type: hmUI.edit_type.WEATHER, preview: 'edit/weather-on.png' },
        { type: hmUI.edit_type.ALTIMETER, preview: 'edit/weather-off.png' },
      ],
    })

    hmUI.createWidget(hmUI.widget.WATCHFACE_EDIT_FG_MASK, {
      x: Math.floor((width - 160) / 2),
      y: Math.floor((height - 50) / 2) - 35,
      w: 160,
      h: 30,
      src: 'edit/weather-mask.png',
      show_level: hmUI.show_level.ONLY_EDIT,
    })

    const weatherBgType = weatherEditGroup.getProperty(hmUI.prop.CURRENT_TYPE)
    if (weatherBgType === hmUI.edit_type.WEATHER) { weather({}) }

    animation({
      anim_path: 'blablabla',
      anim_prefix: 'frame',
      anim_ext: 'png',
      anim_fps: 10,
      anim_size: 9,
      repeat_count: 0,
      anim_status: hmUI.anim_status.START,
      w: 320,
      h: 240,
      y: 100,
      x: -10,
    })

    // Temperature at top
    temperature({ h: 50, x: 120, y: -150, w: 60 })

    // Weather icon
    weather({ folder: 'weather-icons', w: 96, h: 96, x: 50, y: -140 })

    // Time display - hours above, minutes below
    time({
      w: 320,
      h: 160,
      y: -100,
      hour_unit_en: '',
      hour_unit_sc: '',
      minute_follow: 0,
      minute_startX: 290,
      minute_startY: 140,
      minute_align: hmUI.align.CENTER_H,
    })

    // Date below time
    // circle({ alpha: 100, radius: 20, x: 100, y: 120 })
    date({ y: 110, x: 50, w: 0, h: 40 })

    // Battery at bottom
    battery({ y: -190, x: -40, w: 100, h: 40 })
    click({ y: -190, x: -40, w: 100, h: 40, src: '', type: hmUI.data_type.BATTERY })

    // Editable data widget - editable first, textImg after with ONLY_NORMAL
    const editGroup = editable({
      edit_id: 1,
      x: 80,
      y: 180,
      w: 100,
      h: 50,
      tips_BG: 'edit/tips-bg.png',
      tips_y: 0,
      tips_width: 100,
      optional_types: [
        { type: hmUI.edit_type.STEP, preview: 'edit/select.png' },
        { type: hmUI.edit_type.CAL, preview: 'edit/select.png' },
        { type: hmUI.edit_type.HEART, preview: 'edit/select.png' },
        { type: hmUI.edit_type.PAI_WEEKLY, preview: 'edit/select.png' },
        { type: hmUI.edit_type.DISTANCE, preview: 'edit/select.png' },
      ],
    })

    const editType = editGroup.getProperty(hmUI.prop.CURRENT_TYPE)

    const dataTypes = {
      [hmUI.edit_type.STEP]: { type: hmUI.data_type.STEP },
      [hmUI.edit_type.CAL]: { type: hmUI.data_type.CAL },
      [hmUI.edit_type.HEART]: { type: hmUI.data_type.HEART },
      [hmUI.edit_type.PAI_WEEKLY]: { type: hmUI.data_type.PAI_WEEKLY },
      [hmUI.edit_type.DISTANCE]: { type: hmUI.data_type.DISTANCE },
    }

    const dataConfig = dataTypes[editType] || { type: hmUI.data_type.STEP }

    textImg({ x: 80, y: 180, w: 100, h: 50, type: dataConfig.type, show_level: hmUI.show_level.ONLY_NORMAL })

    // Status icons
    alarm({ x: -150, y: 0, w: 48, h: 48 })
    click({ x: -150, y: 0, w: 48, h: 48, type: hmUI.data_type.ALARM_CLOCK })
    disconnect({ x: -150, y: 50, w: 48, h: 48 })
    dnd({ x: -150, y: 100, w: 48, h: 48 })
    lock({ x: -150, y: 150, w: 48, h: 48 })

    // flash({ x: -140, y: 10 })
  },

  onDestroy() {
    console.log('index page.js on destroy invoke')
  },
})
