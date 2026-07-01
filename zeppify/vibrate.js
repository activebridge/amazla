/**
 * Zeppify Vibrator Module
 * Unified vibrator for ZeppOS v1 (hmSensor global) and v2/v3 (@zos/sensor).
 *
 * The two platforms drive the motor DIFFERENTLY, so this branches by platform:
 *   v1: hmSensor VIBRATE sensor — set the numeric `.scene` property, then start().
 *   v2/v3: @zos/sensor Vibrator — setMode(VIBRATOR_SCENE_*), then start().
 * The v1 scene NUMBERS and the v3 constant VALUES are NOT the same enum, so each
 * platform gets its own map (passing v1 numbers to the v3 Vibrator just yields the
 * default buzz — which is why every scene felt identical). Sources:
 *   v1: docs.zepp.com/docs/1.0/reference/device-app-api/hmSensor/sensorId/VIBRATE
 *   v3: docs.zepp.com/docs/reference/device-app-api/newAPI/sensor/Vibrator
 */
import {
  Vibrator,
  VIBRATOR_SCENE_CALL,
  VIBRATOR_SCENE_DURATION,
  VIBRATOR_SCENE_DURATION_LONG,
  VIBRATOR_SCENE_NOTIFICATION,
  VIBRATOR_SCENE_SHORT_LIGHT,
  VIBRATOR_SCENE_SHORT_MIDDLE,
  VIBRATOR_SCENE_SHORT_STRONG,
  VIBRATOR_SCENE_STRONG_REMINDER,
  VIBRATOR_SCENE_TIMER,
} from '@zos/sensor'

// v1 hmSensor `.scene` numeric values (docs table). 20ms buzzes 23/24/25; 28=600ms,
// 27=1000ms; 0=notification (×2), 9=reminder (×4); 1=call, 5=timer (both continuous).
const V1 = {
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

// v2/v3 @zos/sensor scene constants, keyed the same way.
const V3 = {
  light: VIBRATOR_SCENE_SHORT_LIGHT,
  medium: VIBRATOR_SCENE_SHORT_MIDDLE,
  strong: VIBRATOR_SCENE_SHORT_STRONG,
  duration: VIBRATOR_SCENE_DURATION,
  long: VIBRATOR_SCENE_DURATION_LONG,
  notification: VIBRATOR_SCENE_NOTIFICATION,
  reminder: VIBRATOR_SCENE_STRONG_REMINDER,
  call: VIBRATOR_SCENE_CALL,
  timer: VIBRATOR_SCENE_TIMER,
}

// v1 exposes the hmSensor global (and its VIBRATE sensor uses `.scene`); v2/v3 don't.
const isV1 = typeof hmSensor !== 'undefined' && !!hmSensor.createSensor

// LAZY singleton. ZeppOS v1 forbids creating the VIBRATE sensor more than once per
// page ("Pages can only create one instance of the VIBRATE sensor"), so we create
// it exactly once, on first use, and cache it. Creating it lazily (not at module
// load) also means pages that import zeppify for other things — e.g. keepScreenOn —
// never spin up a VIBRATE sensor they don't use.
let _sensor = null
const getSensor = () => {
  if (!_sensor) {
    _sensor = isV1 ? hmSensor.createSensor(hmSensor.id.VIBRATE) : new Vibrator()
  }
  return _sensor
}

// Fire a scene by semantic key. v1 sets `.scene`; v2/v3 calls setMode() — the two
// APIs use different values, so we pick the right map per platform.
const play = (key) => {
  const sensor = getSensor()
  if (!sensor) return sensor
  sensor.stop() // clear any in-flight scene first (esp. the continuous ones)
  if (isV1) sensor.scene = V1[key]
  else sensor.setMode(V3[key])
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
