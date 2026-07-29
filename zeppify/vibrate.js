/**
 * Zeppify Vibrator Module
 * Drives the motor through the v1 hmSensor VIBRATE sensor: set the numeric
 * `.scene` property, then start().
 *
 * hmSensor is available on EVERY runtime, v1 through v4 — same legacy global
 * namespace as the hmUI / hmSetting that pages/ui.js reads at module top level in
 * both build types. So there is no @zos/sensor branch and no import here, which is
 * also what lets a v1-config build (one package for every device) load this file:
 * a single `import ... from '@zos/*'` compiles to a top-level __$$RQR$$__(...) the
 * v1 runtime can't load.
 *
 * Scene table:
 *   docs.zepp.com/docs/1.0/reference/device-app-api/hmSensor/sensorId/VIBRATE
 */

// hmSensor `.scene` numeric values (docs table). 20ms buzzes 23/24/25; 28=600ms,
// 27=1000ms; 0=notification (×2), 9=reminder (×4); 1=call, 5=timer (both continuous).
const SCENES = {
  light: 23,
  medium: 24,
  strong: 25,
  duration: 28,
  long: 27,
  notification: 0,
  reminder: 9,
  call: 1,
  timer: 5,
}

const hasSensor = () => typeof hmSensor !== 'undefined' && !!hmSensor.createSensor

// LAZY singleton. ZeppOS v1 forbids creating the VIBRATE sensor more than once per
// page ("Pages can only create one instance of the VIBRATE sensor"), so we create
// it exactly once, on first use, and cache it. Creating it lazily (not at module
// load) also means pages that import zeppify for other things — e.g. keepScreenOn —
// never spin up a VIBRATE sensor they don't use.
let _sensor = null
const getSensor = () => {
  if (!_sensor && hasSensor()) _sensor = hmSensor.createSensor(hmSensor.id.VIBRATE)
  return _sensor
}

// Fire a scene by semantic key.
//
// Two ways to select it, because modern firmware hands back the NEW Vibrator under
// the legacy hmSensor name: there `.scene` is inert (assigning it changes nothing —
// device-checked on Balance, where scene 27's 1000ms buzz came out as the default
// short one) and setMode() is what picks the pattern. The v1 scene table and the
// v2/v3 VIBRATOR_SCENE_* constants describe the same nine patterns, so the same
// number goes to whichever the sensor understands. Set both, then start.
const play = (key) => {
  const sensor = getSensor()
  if (!sensor) return sensor
  sensor.stop() // clear any in-flight scene first (esp. the continuous ones)
  sensor.scene = SCENES[key]
  if (sensor.setMode) sensor.setMode(SCENES[key])
  sensor.start()
  return sensor
}

// Semantic API. Short buzzes by intensity (light/medium/high|strong), longer single
// buzzes (duration/long), and the multi-buzz patterns (notification|double, reminder).
// call/timer are CONTINUOUS — stop() them yourself.
export const vibro = {
  // intensity — short 20ms buzzes
  light: () => play('light'),
  medium: () => play('medium'),
  high: () => play('strong'),
  strong: () => play('strong'),
  // duration — single longer buzz
  short: () => play('medium'),
  duration: () => play('duration'), // 600ms
  long: () => play('long'), // 1000ms
  // patterns
  notification: () => play('notification'), // two short buzzes
  double: () => play('notification'),
  reminder: () => play('reminder'), // four buzzes
  call: () => play('call'), // continuous — stop() to end
  timer: () => play('timer'), // continuous — stop() to end
  // control
  stop: () => {
    // Only stop if the sensor was ever created — don't lazily spin one up just to stop.
    if (_sensor) _sensor.stop()
  },
}

export default vibro
